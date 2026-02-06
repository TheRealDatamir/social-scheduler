'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { upload } from '@vercel/blob/client';
import {
  Upload, Calendar, Instagram, Trash2, Settings, Clock,
  Loader2, ChevronUp, ChevronDown, Plus, History, GripVertical,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Types ───────────────────────────────────────────────────────────────────

type PostType = 'queued' | 'scheduled';
type PostStatus = 'pending' | 'published' | 'failed';
type ActiveTab = 'upload' | 'schedule' | 'history';

interface Post {
  id: number;
  imageUrl: string;
  caption: string;
  type: PostType;
  isExtra: boolean; // For scheduled posts: if true, doesn't consume the queue
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
  isExtra: boolean; // For scheduled posts: if true, doesn't consume the queue
  scheduledDate: string;
}

// A single day in the projected schedule
interface ScheduleDay {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  displayDate: string;
  isPostingDay: boolean;
  // Posts assigned to this day
  scheduledPost: Post | null; // replaces queue (isExtra=false)
  extraPosts: Post[]; // additional scheduled posts (isExtra=true)
  queuedPost: Post | null; // from queue (only if no non-extra scheduledPost)
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
  const [editingIsExtra, setEditingIsExtra] = useState(false);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

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
      const [queueRes, scheduledRes, publishedRes, failedRes, settingsRes] = await Promise.all([
        fetch('/api/posts?type=queued&status=pending'),
        fetch('/api/posts?type=scheduled&status=pending'),
        fetch('/api/posts?status=published'),
        fetch('/api/posts?status=failed'),
        fetch('/api/settings'),
      ]);

      if (queueRes.ok) setQueuedPosts(await queueRes.json());
      if (scheduledRes.ok) {
        const scheduled = await scheduledRes.json();
        setScheduledPosts(scheduled.sort((a: Post, b: Post) => {
          const aDate = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
          const bDate = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
          return aDate - bDate;
        }));
      }
      // Combine published and failed posts for history, sorted by date (newest first)
      const published = publishedRes.ok ? await publishedRes.json() : [];
      const failed = failedRes.ok ? await failedRes.json() : [];
      const allHistory = [...published, ...failed].sort((a: Post, b: Post) => {
        const aDate = a.publishedAt || a.createdAt;
        const bDate = b.publishedAt || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
      setHistoryPosts(allHistory);
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
    const queue = [...queuedPosts];
    let queuePointer = 0;

    // Build lookup maps for scheduled posts by date string
    // Separate into regular (isExtra=false) and extra (isExtra=true)
    const regularByDate = new Map<string, Post[]>(); // isExtra=false, consumes queue
    const extraByDate = new Map<string, Post[]>(); // isExtra=true, doesn't consume queue

    for (const post of scheduledPosts) {
      if (!post.scheduledAt) continue;
      const dateStr = toDateStr(new Date(post.scheduledAt));
      if (post.isExtra) {
        const arr = extraByDate.get(dateStr) || [];
        arr.push(post);
        extraByDate.set(dateStr, arr);
      } else {
        const arr = regularByDate.get(dateStr) || [];
        arr.push(post);
        regularByDate.set(dateStr, arr);
      }
    }

    // Find the latest scheduled date so we know how far to project
    let latestScheduledDate: Date | null = null;
    for (const post of scheduledPosts) {
      if (post.scheduledAt) {
        const d = new Date(post.scheduledAt);
        if (!latestScheduledDate || d > latestScheduledDate) latestScheduledDate = d;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cursor = new Date(today);
    cursor.setDate(cursor.getDate() + 1); // Start from tomorrow

    let daysProjected = 0;

    // Project until we've placed all queued posts AND passed the latest scheduled date
    while (daysProjected < 365) {
      const dateStr = toDateStr(cursor);
      const isPostingDay = checkIsPostingDay(cursor, settings.postingFrequency);

      const regularForDay = regularByDate.get(dateStr) || []; // isExtra=false
      const extraForDay = extraByDate.get(dateStr) || []; // isExtra=true
      const hasRegularScheduled = regularForDay.length > 0;
      const hasExtra = extraForDay.length > 0;

      if (isPostingDay || hasRegularScheduled || hasExtra) {
        let queuedPost: Post | null = null;
        let queueIndex: number | null = null;

        // If it's a posting day and no regular scheduled post (isExtra=false) consumes the queue, pull from queue
        if (isPostingDay && !hasRegularScheduled && queuePointer < queue.length) {
          queuedPost = queue[queuePointer];
          queueIndex = queuePointer;
          queuePointer++;
        }

        const isEmpty = !hasRegularScheduled && !hasExtra && !queuedPost;

        days.push({
          date: new Date(cursor),
          dateStr,
          displayDate: formatDateDisplay(cursor),
          isPostingDay,
          scheduledPost: regularForDay[0] || null, // First regular scheduled post
          extraPosts: [...(regularForDay.length > 1 ? regularForDay.slice(1) : []), ...extraForDay],
          queuedPost,
          queueIndex,
          isEmpty,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
      daysProjected++;

      // Stop once we've placed all queued posts AND passed the latest scheduled date
      const allQueuePlaced = queuePointer >= queue.length;
      const pastLastScheduled = !latestScheduledDate || cursor > latestScheduledDate;
      if (allQueuePlaced && pastLastScheduled) break;
    }

    // Trim trailing empty days — only show empty days between posts, not after the last one
    while (days.length > 0 && days[days.length - 1].isEmpty) {
      days.pop();
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

  const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB — Instagram's limit
  const MAX_CAPTION_LENGTH = 2200; // Instagram's caption character limit

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);

    const tooLarge = files.filter(f => f.size > MAX_FILE_SIZE);
    if (tooLarge.length > 0) {
      const names = tooLarge.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ');
      alert(`These files exceed Instagram's 8MB limit and were skipped:\n${names}`);
    }

    const validFiles = files.filter(f => f.size <= MAX_FILE_SIZE);
    const newImages: LocalImage[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      type: 'queued' as PostType,
      isExtra: false,
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
        ? { ...img, type, isExtra: type === 'queued' ? false : img.isExtra, scheduledDate: type === 'queued' ? '' : img.scheduledDate }
        : img
    ));
  }

  function setImageIsExtra(imageId: string, isExtra: boolean) {
    setImages(prev => prev.map(img =>
      img.id === imageId ? { ...img, isExtra } : img
    ));
  }

  async function uploadAll() {
    const missingCaptions = images.filter(img => !img.caption.trim());
    if (missingCaptions.length > 0) {
      alert(`Please add captions to all images. ${missingCaptions.length} missing.`);
      return;
    }

    const tooLongCaptions = images.filter(img => img.caption.length > MAX_CAPTION_LENGTH);
    if (tooLongCaptions.length > 0) {
      alert(`${tooLongCaptions.length} caption(s) exceed Instagram's ${MAX_CAPTION_LENGTH} character limit. Please shorten them.`);
      return;
    }

    const needDate = images.filter(
      img => img.type === 'scheduled' && !img.scheduledDate
    );
    if (needDate.length > 0) {
      alert(`Please set a date for all scheduled posts. ${needDate.length} missing.`);
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
          isExtra: img.type === 'scheduled' ? img.isExtra : false,
        };

        if (img.type === 'scheduled') {
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

  // ─── Queue Reordering (Drag & Drop) ──────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before starting drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as number);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    setActiveDragId(null); // Clear the drag state
    
    if (!over || active.id === over.id) return;

    const oldIndex = queuedPosts.findIndex(p => p.id === active.id);
    const newIndex = queuedPosts.findIndex(p => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(queuedPosts, oldIndex, newIndex);
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

  function handleDragCancel() {
    setActiveDragId(null);
  }

  // Get the currently dragging post for the overlay
  const activeDragPost = activeDragId ? queuedPosts.find(p => p.id === activeDragId) : null;

  // Legacy arrow-based reordering (still used as fallback)
  async function moveQueueItem(queueIndex: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? queueIndex - 1 : queueIndex + 1;
    if (newIndex < 0 || newIndex >= queuedPosts.length) return;

    const reordered = arrayMove(queuedPosts, queueIndex, newIndex);
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
    setEditingIsExtra(post.isExtra);
  }

  function cancelEditing() {
    setEditingPostId(null);
    setEditingCaption('');
    setEditingDate('');
    setEditingType('queued');
    setEditingIsExtra(false);
  }

  async function saveEdits() {
    if (!editingPostId) return;

    if (editingCaption.length > MAX_CAPTION_LENGTH) {
      alert(`Caption exceeds Instagram's ${MAX_CAPTION_LENGTH} character limit. Please shorten it.`);
      return;
    }

    try {
      const body: Record<string, unknown> = {
        caption: editingCaption,
        type: editingType,
        isExtra: editingType === 'scheduled' ? editingIsExtra : false,
      };

      if (editingType === 'scheduled') {
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

  function typeLabel(post: Post): string {
    if (post.type === 'queued') return 'From Queue';
    if (post.isExtra) return 'Scheduled (Extra)';
    return 'Scheduled';
  }

  function typeBadgeClass(post: Post): string {
    if (post.type === 'queued') return 'bg-blue-500/30 text-blue-300';
    if (post.isExtra) return 'bg-emerald-500/30 text-emerald-300';
    return 'bg-amber-500/30 text-amber-300';
  }

  function uploadTypeBadgeClass(type: PostType, isExtra: boolean): string {
    if (type === 'queued') return 'bg-blue-500/30 text-blue-300';
    if (isExtra) return 'bg-emerald-500/30 text-emerald-300';
    return 'bg-amber-500/30 text-amber-300';
  }

  function uploadTypeLabel(type: PostType, isExtra: boolean): string {
    if (type === 'queued') return 'Queued';
    if (isExtra) return 'Scheduled (Extra)';
    return 'Scheduled';
  }

  // ─── Sortable Queue Item (for drag & drop reordering) ───────────────────

  function SortableQueueItem({ post, queueIndex }: { post: Post; queueIndex: number }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: post.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 1000 : 'auto',
    };

    return (
      <div ref={setNodeRef} style={style} className={isDragging ? 'bg-purple-500/20 rounded-lg' : ''}>
        {renderPostCard(post, queueIndex, { attributes, listeners })}
      </div>
    );
  }

  // ─── Post Card (reusable in schedule rows) ──────────────────────────────

  function renderPostCard(
    post: Post, 
    queueIndex: number | null = null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dragHandleProps?: { attributes: Record<string, any>; listeners: Record<string, any> | undefined }
  ) {
    const isEditing = editingPostId === post.id;
    const isDeleting = showDeleteConfirm === post.id;

    const showQueueControls = post.type === 'queued' && queueIndex !== null && !isEditing;

    return (
      <div key={post.id} className="flex gap-3 items-start max-w-2xl">
        {/* Queue drag handle + position OR spacer for alignment */}
        {showQueueControls ? (
          <div className="flex flex-col items-center gap-0.5 pt-1 flex-shrink-0 w-6">
            {dragHandleProps ? (
              <button
                {...dragHandleProps.attributes}
                {...(dragHandleProps.listeners ?? {})}
                className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing p-1 touch-none"
                title="Drag to reorder"
              >
                <GripVertical size={16} />
              </button>
            ) : (
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveQueueItem(queueIndex, 'up')}
                  disabled={queueIndex === 0}
                  className="text-gray-500 hover:text-gray-300 disabled:opacity-20 p-0.5"
                  title="Move up in queue"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveQueueItem(queueIndex, 'down')}
                  disabled={queueIndex === queuedPosts.length - 1}
                  className="text-gray-500 hover:text-gray-300 disabled:opacity-20 p-0.5"
                  title="Move down in queue"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            <span className="text-[10px] font-bold text-gray-500">#{queueIndex + 1}</span>
          </div>
        ) : (
          /* Spacer for non-queued posts to maintain alignment */
          <div className="flex flex-col items-center pt-1 flex-shrink-0 w-6">
            <div className="text-gray-600 opacity-50">║</div>
          </div>
        )}

        {/* Thumbnail */}
        <img src={post.imageUrl} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeBadgeClass(post)}`}>
              {typeLabel(post)}
            </span>
            {!isEditing && (
              <div className="flex gap-2">
                <button onClick={() => startEditing(post)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">
                  Edit
                </button>
                <button onClick={() => setShowDeleteConfirm(post.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2 mt-1">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-400">Caption</span>
                  <span className={`text-xs ${
                    editingCaption.length > MAX_CAPTION_LENGTH 
                      ? 'text-red-400 font-semibold' 
                      : 'text-gray-500'
                  }`}>
                    {editingCaption.length}/{MAX_CAPTION_LENGTH}
                  </span>
                </div>
                <textarea
                  value={editingCaption}
                  onChange={(e) => setEditingCaption(e.target.value)}
                  className={`w-full bg-[#383a40] border text-gray-200 rounded-lg p-2 text-sm ${
                    editingCaption.length > MAX_CAPTION_LENGTH
                      ? 'border-red-500'
                      : 'border-[#4a4d55]'
                  }`}
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 block mb-1">Type</label>
                <div className="flex gap-1.5">
                  {(['queued', 'scheduled'] as PostType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setEditingType(t);
                        if (t === 'queued') setEditingIsExtra(false);
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-semibold ${
                        editingType === t ? 'bg-purple-600 text-white' : 'bg-[#383a40] text-gray-300'
                      }`}
                    >
                      {t === 'queued' ? 'Queued' : 'Scheduled'}
                    </button>
                  ))}
                </div>
              </div>
              {editingType === 'scheduled' && (
                <>
                  <input
                    type="date"
                    value={editingDate}
                    onChange={(e) => setEditingDate(e.target.value)}
                    className="w-full bg-[#383a40] border border-[#4a4d55] text-gray-200 rounded px-3 py-1 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-300">
                    <input
                      type="checkbox"
                      checked={editingIsExtra}
                      onChange={(e) => setEditingIsExtra(e.target.checked)}
                      className="w-4 h-4 rounded border-[#4a4d55] bg-[#383a40] text-purple-600 focus:ring-purple-500"
                    />
                    <span>Extra post (doesn&apos;t replace queue)</span>
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <button onClick={saveEdits} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-blue-500">
                  Save
                </button>
                <button onClick={cancelEditing} className="bg-[#383a40] text-gray-300 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-[#43454d]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300 line-clamp-2">{post.caption}</p>
          )}

          {isDeleting && (
            <div className="mt-2 flex gap-2">
              <button onClick={() => deletePost(post.id)} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-500">
                Confirm Delete
              </button>
              <button onClick={() => setShowDeleteConfirm(null)} className="bg-[#383a40] text-gray-300 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-[#43454d]">
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
      <div className="min-h-screen bg-[#1e1f22] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  const totalPending = queuedPosts.length + scheduledPosts.length;

  // Calculate days of posting coverage
  const daysOfPosting = projectedSchedule.filter(day => !day.isEmpty).length;
  const daysColor = daysOfPosting > 7 ? 'text-green-400' : daysOfPosting > 3 ? 'text-yellow-400' : 'text-red-400';
  const daysBgColor = daysOfPosting > 7 ? 'bg-green-500/20' : daysOfPosting > 3 ? 'bg-yellow-500/20' : 'bg-red-500/20';

  return (
    <div className="min-h-screen bg-[#1e1f22] p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-[#2b2d31] rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-2">
                <Instagram className="text-purple-400" />
                Social Post Scheduler
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-gray-400">
                  {queuedPosts.length} in queue · {scheduledPosts.length} scheduled · Posting {settings.postingFrequency.replace(/-/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-sm font-semibold ${daysBgColor} ${daysColor}`}>
                  {daysOfPosting} days of content
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-[#383a40] hover:bg-[#43454d] text-gray-200 rounded-lg transition-colors"
            >
              <Settings size={20} />
              Settings
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-[#2b2d31] rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Posting Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Posting Frequency</label>
                <select
                  value={settings.postingFrequency}
                  onChange={(e) => updateSettings({ postingFrequency: e.target.value })}
                  className="w-full bg-[#383a40] border border-[#4a4d55] text-gray-200 rounded-lg px-4 py-2"
                >
                  {frequencyOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Posting Time</label>
                <input
                  type="time"
                  value={settings.postingTime}
                  onChange={(e) => updateSettings({ postingTime: e.target.value })}
                  className="w-full bg-[#383a40] border border-[#4a4d55] text-gray-200 rounded-lg px-4 py-2"
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
                  : 'bg-[#2b2d31] text-gray-300 hover:bg-[#383a40]'
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
            <div className="bg-[#2b2d31] rounded-lg shadow-lg p-8">
              <label className="block cursor-pointer">
                <div className="border-4 border-dashed border-purple-500/50 rounded-lg p-12 text-center hover:border-purple-400 transition-colors bg-purple-500/10">
                  <Upload className="mx-auto mb-4 text-purple-400" size={48} />
                  <p className="text-lg font-semibold text-gray-200">Drop images here or click to upload</p>
                  <p className="text-sm text-gray-400 mt-2">Upload content to add to your queue or schedule</p>
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
                <div className="bg-[#2b2d31] rounded-lg shadow-lg p-6">
                  <button
                    onClick={uploadAll}
                    disabled={uploading}
                    className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-green-500 hover:to-teal-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                    <div key={image.id} className="bg-[#2b2d31] rounded-lg shadow-lg overflow-hidden">
                      <div className="relative">
                        <img src={image.preview} alt="Upload" className="w-full h-64 object-cover" />
                        <button
                          onClick={() => removeImage(image.id)}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                        <div className={`absolute top-2 left-2 px-3 py-1 rounded-full text-sm font-semibold ${uploadTypeBadgeClass(image.type, image.isExtra)}`}>
                          {uploadTypeLabel(image.type, image.isExtra)}
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-400 block mb-1">Post Type</label>
                          <div className="flex gap-2">
                            {(['queued', 'scheduled'] as PostType[]).map(t => (
                              <button
                                key={t}
                                onClick={() => setImageType(image.id, t)}
                                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                  image.type === t
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-[#383a40] text-gray-300 hover:bg-[#43454d]'
                                }`}
                              >
                                {t === 'queued' ? 'Queued' : 'Scheduled'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {image.type === 'scheduled' && (
                          <>
                            <div>
                              <label className="text-xs font-semibold text-gray-400 block mb-1">
                                <Clock size={12} className="inline mr-1" />
                                Post Date
                              </label>
                              <input
                                type="date"
                                value={image.scheduledDate}
                                onChange={(e) => updateImage(image.id, { scheduledDate: e.target.value })}
                                className="w-full bg-[#383a40] border border-[#4a4d55] text-gray-200 rounded-lg px-3 py-2 text-sm"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-300">
                              <input
                                type="checkbox"
                                checked={image.isExtra}
                                onChange={(e) => setImageIsExtra(image.id, e.target.checked)}
                                className="w-4 h-4 rounded border-[#4a4d55] bg-[#383a40] text-purple-600 focus:ring-purple-500"
                              />
                              <span>Extra post (doesn&apos;t replace queue)</span>
                            </label>
                          </>
                        )}

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-semibold text-gray-400">Caption</label>
                            <span className={`text-xs ${
                              image.caption.length > MAX_CAPTION_LENGTH 
                                ? 'text-red-400 font-semibold' 
                                : image.caption.length > MAX_CAPTION_LENGTH - 200
                                  ? 'text-yellow-400'
                                  : 'text-gray-500'
                            }`}>
                              {image.caption.length}/{MAX_CAPTION_LENGTH}
                            </span>
                          </div>
                          <textarea
                            value={image.caption}
                            onChange={(e) => updateImage(image.id, { caption: e.target.value })}
                            placeholder="Write a caption..."
                            className={`w-full bg-[#383a40] border text-gray-200 placeholder-gray-500 rounded-lg p-3 text-sm focus:ring-2 focus:border-transparent ${
                              image.caption.length > MAX_CAPTION_LENGTH
                                ? 'border-red-500 focus:ring-red-500'
                                : 'border-[#4a4d55] focus:ring-purple-500'
                            }`}
                            rows={3}
                          />
                          {image.caption.length > MAX_CAPTION_LENGTH && (
                            <p className="text-xs text-red-400 mt-1">
                              Caption is {image.caption.length - MAX_CAPTION_LENGTH} characters over the limit
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {images.length === 0 && (
              <div className="bg-[#2b2d31] rounded-lg shadow-lg p-12 text-center">
                <p className="text-gray-400">No images staged. Upload some content above!</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Schedule Tab (Combined Timeline) ─────────────────────────── */}
        {activeTab === 'schedule' && (
          <div className="space-y-0">
            {/* Header info */}
            <div className="bg-[#2b2d31] rounded-lg shadow-lg p-4 mb-4">
              <h2 className="text-lg font-bold text-gray-100">Your Schedule</h2>
              <p className="text-sm text-gray-400">
                Day-by-day view of what will be posted. Drag the <GripVertical size={14} className="inline text-gray-500" /> handle to reorder queued posts.
              </p>
            </div>

            {totalPending === 0 ? (
              <div className="bg-[#2b2d31] rounded-lg shadow-lg p-12 text-center">
                <Calendar className="mx-auto mb-4 text-gray-500" size={64} />
                <p className="text-gray-400 text-lg">No posts yet</p>
                <p className="text-gray-500 mt-2">Upload some content to start building your schedule.</p>
              </div>
            ) : projectedSchedule.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={queuedPosts.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={`space-y-2 ${activeDragId ? 'overflow-visible' : ''}`}>
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
                        <div 
                          key={day.dateStr} 
                          className={`bg-[#2b2d31] rounded-lg shadow-sm border border-[#3f4147] ${
                            activeDragId ? 'overflow-visible' : 'overflow-hidden'
                          }`}
                        >
                          {/* Date header */}
                          <div className={`px-4 py-2 flex items-center justify-between border-b border-[#3f4147] ${
                            day.isEmpty ? 'bg-[#2b2d31]' : 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20'
                          }`}>
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className={day.isEmpty ? 'text-gray-500' : 'text-purple-400'} />
                              <span className={`text-sm font-bold ${day.isEmpty ? 'text-gray-500' : 'text-gray-200'}`}>
                                {day.displayDate}
                              </span>
                            </div>
                            {day.isEmpty && (
                              <span className="text-xs text-gray-500 italic">No content — queue empty</span>
                            )}
                            {!day.isPostingDay && !day.isEmpty && (
                              <span className="text-xs text-gray-500">Not a regular posting day</span>
                            )}
                          </div>

                          {/* Posts for this day */}
                          {allPostsForDay.length > 0 && (
                            <div className={`p-4 space-y-3 ${activeDragId ? 'overflow-visible' : ''}`}>
                              {allPostsForDay.map(({ post, queueIndex }) => (
                                post.type === 'queued' && queueIndex !== null ? (
                                  <SortableQueueItem key={post.id} post={post} queueIndex={queueIndex} />
                                ) : (
                                  <div key={post.id}>
                                    {renderPostCard(post, queueIndex)}
                                  </div>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>

                {/* Drag overlay - renders floating clone of dragged item */}
                <DragOverlay>
                  {activeDragPost ? (
                    <div className="bg-[#383a40] rounded-lg shadow-xl border-2 border-purple-400 p-3">
                      <div className="flex gap-3 items-start">
                        <img 
                          src={activeDragPost.imageUrl} 
                          alt="" 
                          className="w-16 h-16 object-cover rounded-lg flex-shrink-0" 
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-300">
                            From Queue
                          </span>
                          <p className="text-sm text-gray-300 line-clamp-2 mt-1">{activeDragPost.caption}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : null}
          </div>
        )}

        {/* ─── History Tab ──────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-[#2b2d31] rounded-lg shadow-lg p-4">
              <h2 className="text-lg font-bold text-gray-100">Post History</h2>
              <p className="text-sm text-gray-400">Previously published and failed posts.</p>
            </div>

            {historyPosts.length > 0 ? (
              historyPosts.map((post) => (
                <div key={post.id} className={`bg-[#2b2d31] rounded-lg shadow-lg p-4 ${post.status === 'failed' ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500'}`}>
                  <div className="flex gap-4 items-start">
                    <img src={post.imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          post.status === 'published' ? 'bg-green-500/30 text-green-300' : 'bg-red-500/30 text-red-300'
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
                      <p className="text-sm text-gray-300 line-clamp-2">{post.caption}</p>
                      {post.error && (
                        <p className="text-xs text-red-400 mt-1 line-clamp-1">Error: {post.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-[#2b2d31] rounded-lg shadow-lg p-12 text-center">
                <History className="mx-auto mb-4 text-gray-500" size={64} />
                <p className="text-gray-400 text-lg">No history yet</p>
                <p className="text-gray-500 mt-2">Published posts will appear here.</p>
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
