'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { upload } from '@vercel/blob/client';
import {
  Upload, Calendar, Instagram, Trash2, Settings, Clock,
  Loader2, ChevronUp, ChevronDown, Plus, History,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type PostType = 'queued' | 'scheduled' | 'extra';
type PostStatus = 'pending' | 'published' | 'failed';
type ActiveTab = 'upload' | 'schedule' | 'history';

interface Post {
  id: number;
  imageUrl: string;
  caption: string;
  type: PostType;
  scheduledAt: string | null;
  queueOrder: number | null;
  status: PostStatus;
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
}

interface AppSettings {
  postingFrequency: string;
  postingTime: string;
  timezone: string;
}

interface LocalImage {
  id: string;
  file: File;
  preview: string;
  caption: string;
  type: PostType;
  scheduledDate: string;
}

// A single day in the projected schedule
interface ScheduleDay {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  displayDate: string;
  isPostingDay: boolean;
  // Posts assigned to this day
  scheduledPost: Post | null; // replaces queue
  extraPosts: Post[]; // additional posts
  queuedPost: Post | null; // from queue (only if no scheduledPost)
  queueIndex: number | null; // position in queue for reorder controls
  isEmpty: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SocialScheduler() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [queuedPosts, setQueuedPosts] = useState<Post[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<Post[]>([]);
  const [historyPosts, setHistoryPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState('');
  const [editingDate, setEditingDate] = useState('');
  const [editingType, setEditingType] = useState<PostType>('queued');

  const [settings, setSettings] = useState<AppSettings>({
    postingFrequency: 'daily',
    postingTime: '12:00',
    timezone: 'America/New_York',
  });

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, scheduledRes, extraRes, historyRes, settingsRes] = await Promise.all([
        fetch('/api/posts?type=queued&status=pending'),
        fetch('/api/posts?type=scheduled&status=pending'),
        fetch('/api/posts?type=extra&status=pending'),
        fetch('/api/posts?status=published'),
        fetch('/api/settings'),
      ]);

      if (queueRes.ok) setQueuedPosts(await queueRes.json());
      if (scheduledRes.ok) {
        const scheduled = await scheduledRes.json();
        const extra = extraRes.ok ? await extraRes.json() : [];
        setScheduledPosts([...scheduled, ...extra].sort((a: Post, b: Post) => {
          const aDate = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
          const bDate = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
          return aDate - bDate;
        }));
      }
      if (historyRes.ok) setHistoryPosts(await historyRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Schedule Projection ─────────────────────────────────────────────────

  const projectedSchedule = useMemo((): ScheduleDay[] => {
    const days: ScheduleDay[] = [];
    const queue = [...queuedPosts]; // clone so we can shift from it
    let queuePointer = 0;

    // Build lookup maps for scheduled & extra posts by date string
    const scheduledByDate = new Map<string, Post[]>();
    const extraByDate = new Map<string, Post[]>();

    for (const post of scheduledPosts) {
      if (!post.scheduledAt) continue;
      const dateStr = toDateStr(new Date(post.scheduledAt));
      if (post.type === 'scheduled') {
        const arr = scheduledByDate.get(dateStr) || [];
        arr.push(post);
        scheduledByDate.set(dateStr, arr);
      } else if (post.type === 'extra') {
        const arr = extraByDate.get(dateStr) || [];
        arr.push(post);
        extraByDate.set(dateStr, arr);
      }
    }

    // Find the furthest date we need to project to
    const allDates = scheduledPosts
      .filter(p => p.scheduledAt)
      .map(p => new Date(p.scheduledAt!));

    // Project enough days to place all queued posts + cover all scheduled dates + a buffer
    const totalPostsToPlace = queue.length;
    // Minimum 30 days, or enough to fit everything
    const minDays = Math.max(30, totalPostsToPlace * 7, 14);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cursor = new Date(today);
    cursor.setDate(cursor.getDate() + 1); // Start from tomorrow

    let daysProjected = 0;
    let queuedPlaced = 0;

    while (daysProjected < minDays || queuedPlaced < totalPostsToPlace) {
      const dateStr = toDateStr(cursor);
      const isPostingDay = checkIsPostingDay(cursor, settings.postingFrequency);

      const scheduledForDay = scheduledByDate.get(dateStr) || [];
      const extraForDay = extraByDate.get(dateStr) || [];
      const hasScheduled = scheduledForDay.length > 0;
      const hasExtra = extraForDay.length > 0;

      // Only show this day if it's a posting day OR has scheduled/extra posts
      if (isPostingDay || hasScheduled || hasExtra) {
        let queuedPost: Post | null = null;
        let queueIndex: number | null = null;

        // If it's a posting day and no scheduled post replaces the queue, pull from queue
        if (isPostingDay && !hasScheduled && queuePointer < queue.length) {
          queuedPost = queue[queuePointer];
          queueIndex = queuePointer;
          queuePointer++;
          queuedPlaced++;
        }

        const isEmpty = !hasScheduled && !hasExtra && !queuedPost;

        days.push({
          date: new Date(cursor),
          dateStr,
          displayDate: formatDateDisplay(cursor),
          isPostingDay,
          scheduledPost: scheduledForDay[0] || null, // Primary scheduled post
          extraPosts: [...(scheduledForDay.length > 1 ? scheduledForDay.slice(1) : []), ...extraForDay],
          queuedPost,
          queueIndex,
          isEmpty,
        });
      }

      // Also handle non-posting days that have scheduled/extra (already covered above)

      cursor.setDate(cursor.getDate() + 1);
      daysProjected++;

      // Safety cap
      if (daysProjected > 365) break;
    }

    return days;
  }, [queuedPosts, scheduledPosts, settings.postingFrequency]);

  // ─── Settings ────────────────────────────────────────────────────────────

  async function updateSettings(newSettings: Partial<AppSettings>) {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) setSettings(await res.json());
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  }

  // ─── Upload Handling ─────────────────────────────────────────────────────

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const newImages: LocalImage[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      type: 'queued' as PostType,
      scheduledDate: '',
    }));
    setImages(prev => [...prev, ...newImages]);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }

  function updateImage(imageId: string, updates: Partial<LocalImage>) {
    setImages(prev => prev.map(img =>
      img.id === imageId ? { ...img, ...updates } : img
    ));
  }

  function removeImage(imageId: string) {
    const img = images.find(i => i.id === imageId);
    if (img) URL.revokeObjectURL(img.preview);
    setImages(prev => prev.filter(img => img.id !== imageId));
  }

  function setImageType(imageId: string, type: PostType) {
    setImages(prev => prev.map(img =>
      img.id === imageId
        ? { ...img, type, scheduledDate: type === 'queued' ? '' : img.scheduledDate }
        : img
    ));
  }

  async function uploadAll() {
    const missingCaptions = images.filter(img => !img.caption.trim());
    if (missingCaptions.length > 0) {
      alert(`Please add captions to all images. ${missingCaptions.length} missing.`);
      return;
    }

    const needDate = images.filter(
      img => (img.type === 'scheduled' || img.type === 'extra') && !img.scheduledDate
    );
    if (needDate.length > 0) {
      alert(`Please set a date for all scheduled/extra posts. ${needDate.length} missing.`);
      return;
    }

    setUploading(true);

    try {
      for (const img of images) {
        // Client-side upload directly to Vercel Blob (bypasses body size limit)
        const blob = await upload(img.file.name, img.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        });
        const url = blob.url;

        const postBody: Record<string, unknown> = {
          imageUrl: url,
          caption: img.caption,
          type: img.type,
        };

        if (img.type === 'scheduled' || img.type === 'extra') {
          postBody.scheduledAt = new Date(img.scheduledDate + 'T12:00:00').toISOString();
        }

        await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });

        URL.revokeObjectURL(img.preview);
      }

      setImages([]);
      await loadData();
      setActiveTab('schedule');
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Failed to upload posts. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  // ─── Queue Reordering ───────────────────────────────────────────────────

  async function moveQueueItem(queueIndex: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? queueIndex - 1 : queueIndex + 1;
    if (newIndex < 0 || newIndex >= queuedPosts.length) return;

    const reordered = [...queuedPosts];
    [reordered[queueIndex], reordered[newIndex]] = [reordered[newIndex], reordered[queueIndex]];
    setQueuedPosts(reordered);

    try {
      await fetch('/api/posts/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map(p => p.id) }),
      });
    } catch (error) {
      console.error('Error reordering:', error);
      await loadData();
    }
  }

  // ─── Post Editing ────────────────────────────────────────────────────────

  function startEditing(post: Post) {
    setEditingPostId(post.id);
    setEditingCaption(post.caption);
    setEditingDate(post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 10) : '');
    setEditingType(post.type);
  }

  function cancelEditing() {
    setEditingPostId(null);
    setEditingCaption('');
    setEditingDate('');
    setEditingType('queued');
  }

  async function saveEdits() {
    if (!editingPostId) return;

    try {
      const body: Record<string, unknown> = {
        caption: editingCaption,
        type: editingType,
      };

      if (editingType === 'scheduled' || editingType === 'extra') {
        body.scheduledAt = new Date(editingDate + 'T12:00:00').toISOString();
        body.queueOrder = null;
      } else {
        body.scheduledAt = null;
      }

      await fetch(`/api/posts/${editingPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      cancelEditing();
      await loadData();
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save changes');
    }
  }

  async function deletePost(postId: number) {
    try {
      await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      setShowDeleteConfirm(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting:', error);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const frequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'every-other-day', label: 'Every Other Day' },
    { value: '3x-week', label: '3x per Week (M/W/F)' },
    { value: 'weekdays', label: 'Weekdays Only' },
  ];

  function typeLabel(type: PostType): string {
    switch (type) {
      case 'queued': return 'From Queue';
      case 'scheduled': return 'Scheduled';
      case 'extra': return 'Extra';
    }
  }

  function typeBadgeClass(type: PostType): string {
    switch (type) {
      case 'queued': return 'bg-blue-100 text-blue-800';
      case 'scheduled': return 'bg-amber-100 text-amber-800';
      case 'extra': return 'bg-emerald-100 text-emerald-800';
    }
  }

  function uploadTypeLabel(type: PostType): string {
    switch (type) {
      case 'queued': return 'Queued';
      case 'scheduled': return 'Scheduled';
      case 'extra': return 'Extra';
    }
  }

  // ─── Post Card (reusable in schedule rows) ──────────────────────────────

  function renderPostCard(post: Post, queueIndex: number | null = null) {
    const isEditing = editingPostId === post.id;
    const isDeleting = showDeleteConfirm === post.id;

    return (
      <div key={post.id} className="flex gap-3 items-start">
        {/* Queue reorder controls */}
        {post.type === 'queued' && queueIndex !== null && !isEditing && (
          <div className="flex flex-col items-center gap-0.5 pt-1 flex-shrink-0">
            <button
              onClick={() => moveQueueItem(queueIndex, 'up')}
              disabled={queueIndex === 0}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-20 p-0.5"
              title="Move up in queue"
            >
              <ChevronUp size={14} />
            </button>
            <span className="text-[10px] font-bold text-gray-400">#{queueIndex + 1}</span>
            <button
              onClick={() => moveQueueItem(queueIndex, 'down')}
              disabled={queueIndex === queuedPosts.length - 1}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-20 p-0.5"
              title="Move down in queue"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}

        {/* Thumbnail */}
        <img src={post.imageUrl} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeBadgeClass(post.type)}`}>
              {typeLabel(post.type)}
            </span>
            {!isEditing && (
              <div className="flex gap-2">
                <button onClick={() => startEditing(post)} className="text-blue-600 hover:text-blue-700 text-xs font-semibold">
                  Edit
                </button>
                <button onClick={() => setShowDeleteConfirm(post.id)} className="text-red-500 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2 mt-1">
              <textarea
                value={editingCaption}
                onChange={(e) => setEditingCaption(e.target.value)}
                className="w-full border border-blue-300 rounded-lg p-2 text-sm"
                rows={2}
              />
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Type</label>
                <div className="flex gap-1.5">
                  {(['queued', 'scheduled', 'extra'] as PostType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setEditingType(t)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold ${
                        editingType === t ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {uploadTypeLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
              {(editingType === 'scheduled' || editingType === 'extra') && (
                <input
                  type="date"
                  value={editingDate}
                  onChange={(e) => setEditingDate(e.target.value)}
                  className="w-full border border-blue-300 rounded px-3 py-1 text-sm"
                />
              )}
              <div className="flex gap-2">
                <button onClick={saveEdits} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-blue-700">
                  Save
                </button>
                <button onClick={cancelEditing} className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
          )}

          {isDeleting && (
            <div className="mt-2 flex gap-2">
              <button onClick={() => deletePost(post.id)} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-700">
                Confirm Delete
              </button>
              <button onClick={() => setShowDeleteConfirm(null)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-gray-300">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const totalPending = queuedPosts.length + scheduledPosts.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <Instagram className="text-purple-500" />
                Social Post Scheduler
              </h1>
              <p className="text-gray-600 mt-1">
                {queuedPosts.length} in queue · {scheduledPosts.filter(p => p.type === 'scheduled').length} scheduled · {scheduledPosts.filter(p => p.type === 'extra').length} extra · Posting {settings.postingFrequency.replace(/-/g, ' ')}
              </p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Settings size={20} />
              Settings
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Posting Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Posting Frequency</label>
                <select
                  value={settings.postingFrequency}
                  onChange={(e) => updateSettings({ postingFrequency: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                >
                  {frequencyOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Posting Time</label>
                <input
                  type="time"
                  value={settings.postingTime}
                  onChange={(e) => updateSettings({ postingTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { key: 'upload' as ActiveTab, icon: Upload, label: 'Upload' },
            { key: 'schedule' as ActiveTab, icon: Calendar, label: `Schedule (${totalPending})` },
            { key: 'history' as ActiveTab, icon: History, label: 'History' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.key === 'upload' && activeTab === 'upload') {
                  uploadInputRef.current?.click();
                } else {
                  setActiveTab(tab.key);
                }
              }}
              className={`px-5 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Upload Tab ───────────────────────────────────────────────── */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <label className="block cursor-pointer">
                <div className="border-4 border-dashed border-purple-300 rounded-lg p-12 text-center hover:border-purple-500 transition-colors bg-purple-50">
                  <Upload className="mx-auto mb-4 text-purple-500" size={48} />
                  <p className="text-lg font-semibold text-gray-700">Drop images here or click to upload</p>
                  <p className="text-sm text-gray-500 mt-2">Upload content to add to your queue or schedule</p>
                </div>
                <input
                  ref={uploadInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {images.length > 0 && (
              <>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <button
                    onClick={uploadAll}
                    disabled={uploading}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-green-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {uploading ? (
                      <><Loader2 size={20} className="animate-spin" /> Uploading...</>
                    ) : (
                      <><Plus size={20} /> Upload {images.length} Post{images.length !== 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {images.map((image) => (
                    <div key={image.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                      <div className="relative">
                        <img src={image.preview} alt="Upload" className="w-full h-64 object-cover" />
                        <button
                          onClick={() => removeImage(image.id)}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                        <div className={`absolute top-2 left-2 px-3 py-1 rounded-full text-sm font-semibold ${typeBadgeClass(image.type)}`}>
                          {uploadTypeLabel(image.type)}
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Post Type</label>
                          <div className="flex gap-2">
                            {(['queued', 'scheduled', 'extra'] as PostType[]).map(t => (
                              <button
                                key={t}
                                onClick={() => setImageType(image.id, t)}
                                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                  image.type === t
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {uploadTypeLabel(t)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {(image.type === 'scheduled' || image.type === 'extra') && (
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">
                              <Clock size={12} className="inline mr-1" />
                              Post Date
                            </label>
                            <input
                              type="date"
                              value={image.scheduledDate}
                              onChange={(e) => updateImage(image.id, { scheduledDate: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Caption</label>
                          <textarea
                            value={image.caption}
                            onChange={(e) => updateImage(image.id, { caption: e.target.value })}
                            placeholder="Write a caption..."
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {images.length === 0 && (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <p className="text-gray-500">No images staged. Upload some content above!</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Schedule Tab (Combined Timeline) ─────────────────────────── */}
        {activeTab === 'schedule' && (
          <div className="space-y-0">
            {/* Header info */}
            <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
              <h2 className="text-lg font-bold text-gray-800">Your Schedule</h2>
              <p className="text-sm text-gray-500">
                Day-by-day view of what will be posted. Reorder queued posts with the arrows.
              </p>
            </div>

            {projectedSchedule.length > 0 ? (
              <div className="space-y-2">
                {projectedSchedule.map((day) => {
                  const allPostsForDay: { post: Post; queueIndex: number | null }[] = [];

                  if (day.scheduledPost) {
                    allPostsForDay.push({ post: day.scheduledPost, queueIndex: null });
                  }
                  if (day.queuedPost) {
                    allPostsForDay.push({ post: day.queuedPost, queueIndex: day.queueIndex });
                  }
                  for (const extra of day.extraPosts) {
                    allPostsForDay.push({ post: extra, queueIndex: null });
                  }

                  return (
                    <div key={day.dateStr} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                      {/* Date header */}
                      <div className={`px-4 py-2 flex items-center justify-between border-b ${
                        day.isEmpty ? 'bg-gray-50' : 'bg-gradient-to-r from-purple-50 to-indigo-50'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className={day.isEmpty ? 'text-gray-400' : 'text-purple-500'} />
                          <span className={`text-sm font-bold ${day.isEmpty ? 'text-gray-400' : 'text-gray-800'}`}>
                            {day.displayDate}
                          </span>
                        </div>
                        {day.isEmpty && (
                          <span className="text-xs text-gray-400 italic">No content — queue empty</span>
                        )}
                        {!day.isPostingDay && !day.isEmpty && (
                          <span className="text-xs text-gray-400">Not a regular posting day</span>
                        )}
                      </div>

                      {/* Posts for this day */}
                      {allPostsForDay.length > 0 && (
                        <div className="p-4 space-y-3">
                          {allPostsForDay.map(({ post, queueIndex }) => (
                            <div key={post.id}>
                              {renderPostCard(post, queueIndex)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <Calendar className="mx-auto mb-4 text-gray-400" size={64} />
                <p className="text-gray-500 text-lg">Nothing scheduled</p>
                <p className="text-gray-400 mt-2">Upload some content to start building your schedule.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── History Tab ──────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-lg p-4">
              <h2 className="text-lg font-bold text-gray-800">Post History</h2>
              <p className="text-sm text-gray-500">Previously published and failed posts.</p>
            </div>

            {historyPosts.length > 0 ? (
              historyPosts.map((post) => (
                <div key={post.id} className={`bg-white rounded-lg shadow-lg p-4 ${post.status === 'failed' ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500'}`}>
                  <div className="flex gap-4 items-start">
                    <img src={post.imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          post.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {post.status === 'published' ? '✓ Published' : '✗ Failed'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {post.publishedAt
                            ? new Date(post.publishedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                            : new Date(post.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                          }
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
                      {post.error && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-1">Error: {post.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <History className="mx-auto mb-4 text-gray-400" size={64} />
                <p className="text-gray-500 text-lg">No history yet</p>
                <p className="text-gray-400 mt-2">Published posts will appear here.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Utility Functions ─────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function checkIsPostingDay(date: Date, frequency: string): boolean {
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ...

  switch (frequency) {
    case 'daily':
      return true;

    case 'every-other-day': {
      // Use epoch day count — post on even days
      const epoch = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
      return epoch % 2 === 0;
    }

    case '3x-week':
      // Mon, Wed, Fri
      return dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5;

    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;

    default:
      return true;
  }
}
