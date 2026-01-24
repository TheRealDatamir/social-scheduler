'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Calendar, Instagram, Trash2, Settings, Clock, Pin, Loader2 } from 'lucide-react';

interface Post {
  id: number;
  imageUrl: string;
  caption: string;
  scheduledAt: string;
  isPinned: number;
  status: 'pending' | 'scheduled' | 'published' | 'failed';
}

interface Settings {
  postFrequency: 'daily' | 'every-other-day' | '3x-week' | '5x-week';
  preferredTime: string;
  timezone: string;
}

interface LocalImage {
  id: string;
  file: File;
  preview: string;
  caption: string;
  scheduledDate: Date | null;
  isPinned: boolean;
}

export default function SocialScheduler() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'schedule'>('upload');
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  
  const [settings, setSettings] = useState<Settings>({
    postFrequency: 'daily',
    preferredTime: '14:00',
    timezone: 'America/New_York',
  });

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Load posts and settings on mount
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [postsRes, settingsRes] = await Promise.all([
        fetch('/api/posts'),
        fetch('/api/settings'),
      ]);
      
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setPosts(postsData.filter((p: Post) => p.status === 'pending' || p.status === 'scheduled'));
      }
      
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateSettings(newSettings: Partial<Settings>) {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const newImages: LocalImage[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      scheduledDate: null,
      isPinned: false,
    }));
    setImages([...images, ...newImages]);
  }

  function handleUploadTabClick() {
    if (activeTab === 'upload') {
      uploadInputRef.current?.click();
    } else {
      setActiveTab('upload');
    }
  }

  function updateCaption(imageId: string, newCaption: string) {
    setImages(images.map(img =>
      img.id === imageId ? { ...img, caption: newCaption } : img
    ));
  }

  function removeImage(imageId: string) {
    const img = images.find(i => i.id === imageId);
    if (img) URL.revokeObjectURL(img.preview);
    setImages(images.filter(img => img.id !== imageId));
  }

  function pinPostToDate(imageId: string, dateTime: string) {
    setImages(images.map(img =>
      img.id === imageId
        ? { ...img, scheduledDate: new Date(dateTime), isPinned: true }
        : img
    ));
  }

  function unpinPost(imageId: string) {
    setImages(images.map(img =>
      img.id === imageId
        ? { ...img, scheduledDate: null, isPinned: false }
        : img
    ));
  }

  function calculateScheduleDates(count: number, pinnedDates: string[]): Date[] {
    const dates: Date[] = [];
    const now = new Date();
    const [hour, minute] = settings.preferredTime.split(':').map(Number);
    
    const currentDate = new Date(now);
    currentDate.setHours(hour, minute, 0, 0);
    
    if (currentDate <= now) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    while (dates.length < count) {
      const dateStr = currentDate.toDateString();
      
      if (!pinnedDates.includes(dateStr)) {
        dates.push(new Date(currentDate));
      }
      
      switch (settings.postFrequency) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + 1);
          break;
        case 'every-other-day':
          currentDate.setDate(currentDate.getDate() + 2);
          break;
        case '3x-week':
          const day = currentDate.getDay();
          if (day === 1) currentDate.setDate(currentDate.getDate() + 2);
          else if (day === 3) currentDate.setDate(currentDate.getDate() + 2);
          else currentDate.setDate(currentDate.getDate() + 3);
          break;
        case '5x-week':
          currentDate.setDate(currentDate.getDate() + 1);
          while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
            currentDate.setDate(currentDate.getDate() + 1);
          }
          break;
      }
    }
    
    return dates;
  }

  async function uploadAndSchedule() {
    setUploading(true);
    
    try {
      const pinnedImages = images.filter(img => img.isPinned);
      const unpinnedImages = images.filter(img => !img.isPinned);
      
      // Get existing pinned dates
      const existingPinnedDates = posts
        .filter(p => p.isPinned)
        .map(p => new Date(p.scheduledAt).toDateString());
      
      const newPinnedDates = pinnedImages
        .filter(img => img.scheduledDate)
        .map(img => img.scheduledDate!.toDateString());
      
      const allPinnedDates = [...existingPinnedDates, ...newPinnedDates];
      const scheduleDates = calculateScheduleDates(unpinnedImages.length, allPinnedDates);
      
      // Upload and create posts
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        
        // Get presigned URL
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: img.file.name,
            contentType: img.file.type,
          }),
        });
        
        if (!uploadRes.ok) throw new Error('Failed to get upload URL');
        const { uploadUrl, publicUrl } = await uploadRes.json();
        
        // Upload to R2
        await fetch(uploadUrl, {
          method: 'PUT',
          body: img.file,
          headers: { 'Content-Type': img.file.type },
        });
        
        // Determine scheduled date
        let scheduledAt: string;
        let isPinned: boolean;
        
        if (img.isPinned && img.scheduledDate) {
          scheduledAt = img.scheduledDate.toISOString();
          isPinned = true;
        } else {
          const unpinnedIndex = unpinnedImages.findIndex(u => u.id === img.id);
          scheduledAt = scheduleDates[unpinnedIndex].toISOString();
          isPinned = false;
        }
        
        // Create post in database
        await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: publicUrl,
            caption: img.caption,
            scheduledAt: scheduledAt,
            isPinned: isPinned,
          }),
        });
        
        // Clean up preview URL
        URL.revokeObjectURL(img.preview);
      }
      
      // Clear local images and reload
      setImages([]);
      await loadData();
      setActiveTab('schedule');
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Failed to upload and schedule posts');
    } finally {
      setUploading(false);
    }
  }

  async function updatePostCaption(postId: number, newCaption: string) {
    try {
      await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: newCaption }),
      });
      
      setPosts(posts.map(post =>
        post.id === postId ? { ...post, caption: newCaption } : post
      ));
    } catch (error) {
      console.error('Error updating post:', error);
    }
  }

  async function updatePostTime(postId: number, newDateTime: string) {
    try {
      await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scheduledAt: new Date(newDateTime).toISOString(),
          isPinned: true,
        }),
      });
      
      setPosts(posts.map(post =>
        post.id === postId 
          ? { ...post, scheduledAt: new Date(newDateTime).toISOString(), isPinned: 1 } 
          : post
      ));
    } catch (error) {
      console.error('Error updating post time:', error);
    }
  }

  async function deletePost(postId: number) {
    try {
      await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      setPosts(posts.filter(post => post.id !== postId));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  }

  // Convert 24hr time to 12hr for display
  function convertTo12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const modifier = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${modifier}`;
  }

  const frequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'every-other-day', label: 'Every Other Day' },
    { value: '3x-week', label: '3x per Week (M/W/F)' },
    { value: '5x-week', label: 'Weekdays Only' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

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
                Posting {settings.postFrequency.replace('-', ' ')} at {convertTo12Hour(settings.preferredTime)}
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
            <h2 className="text-xl font-bold mb-4">Schedule Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Posting Frequency
                </label>
                <select
                  value={settings.postFrequency}
                  onChange={(e) => updateSettings({ postFrequency: e.target.value as Settings['postFrequency'] })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                >
                  {frequencyOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Preferred Post Time
                </label>
                <input
                  type="time"
                  value={settings.preferredTime}
                  onChange={(e) => updateSettings({ preferredTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleUploadTabClick}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'upload'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Upload className="inline mr-2" size={20} />
            Upload & Edit
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'schedule'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Calendar className="inline mr-2" size={20} />
            Schedule ({posts.length})
          </button>
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <label className="block">
                <div className="border-4 border-dashed border-purple-300 rounded-lg p-12 text-center hover:border-purple-500 transition-colors cursor-pointer bg-purple-50">
                  <Upload className="mx-auto mb-4 text-purple-500" size={48} />
                  <p className="text-lg font-semibold text-gray-700">Drop images here or click to upload</p>
                  <p className="text-sm text-gray-500 mt-2">Upload your content to schedule</p>
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

            {/* Action Button */}
            {images.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <button
                  onClick={uploadAndSchedule}
                  disabled={uploading}
                  className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-green-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Calendar size={20} />
                      Schedule {images.length} Post{images.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
                <p className="text-center text-sm text-gray-500 mt-3">
                  Posts will be scheduled {settings.postFrequency.replace('-', ' ')} at {convertTo12Hour(settings.preferredTime)}
                </p>
              </div>
            )}

            {/* Images Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {images.map((image) => (
                  <div key={image.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="relative">
                      <img
                        src={image.preview}
                        alt="Upload"
                        className="w-full h-64 object-cover"
                      />
                      <button
                        onClick={() => removeImage(image.id)}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                      {image.isPinned && (
                        <div className="absolute top-2 left-2 bg-yellow-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                          <Pin size={14} />
                          Pinned
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">Caption</label>
                      <textarea
                        value={image.caption}
                        onChange={(e) => updateCaption(image.id, e.target.value)}
                        placeholder="Write a caption for this post..."
                        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-3"
                        rows={3}
                      />
                      
                      <div className="border-t pt-3">
                        <label className="text-xs font-semibold text-gray-600 block mb-2">
                          <Clock size={12} className="inline mr-1" />
                          Schedule for specific date/time (optional)
                        </label>
                        {!image.isPinned ? (
                          <input
                            type="datetime-local"
                            onChange={(e) => pinPostToDate(image.id, e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                          />
                        ) : (
                          <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                            <span className="text-sm font-semibold text-yellow-800">
                              {image.scheduledDate?.toLocaleString()}
                            </span>
                            <button
                              onClick={() => unpinPost(image.id)}
                              className="text-xs text-red-600 hover:text-red-700 font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {images.length === 0 && (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <p className="text-gray-500">No images uploaded yet. Start by uploading your content above!</p>
              </div>
            )}
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            {posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post, index) => (
                  <div key={post.id} className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex gap-6">
                      <div className="relative">
                        <img
                          src={post.imageUrl}
                          alt="Scheduled post"
                          className="w-32 h-32 object-cover rounded-lg"
                        />
                        {post.isPinned === 1 && (
                          <div className="absolute -top-2 -right-2 bg-yellow-500 text-white p-1 rounded-full">
                            <Pin size={16} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 mr-4">
                            <div className="text-xs text-gray-500 mb-1">Post #{index + 1}</div>
                            <div className="text-sm text-gray-600 mb-2">
                              {new Date(post.scheduledAt).toLocaleDateString('en-US', { 
                                weekday: 'long',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </div>
                            <input
                              type="datetime-local"
                              value={new Date(post.scheduledAt).toISOString().slice(0, 16)}
                              onChange={(e) => updatePostTime(post.id, e.target.value)}
                              className="border border-gray-300 rounded px-3 py-1 text-sm mb-2"
                            />
                          </div>
                          <div className="flex gap-2">
                            {post.isPinned === 1 && (
                              <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full h-fit">
                                Pinned
                              </span>
                            )}
                            <button
                              onClick={() => setShowDeleteConfirm(post.id)}
                              className="text-red-600 hover:text-red-700 text-sm font-semibold"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 mb-2">
                          <textarea
                            value={post.caption}
                            onChange={(e) => updatePostCaption(post.id, e.target.value)}
                            placeholder="Add a caption..."
                            className="w-full bg-transparent text-sm text-gray-700 border-none focus:outline-none resize-none"
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {showDeleteConfirm === post.id && (
                      <div className="mt-4 border-t pt-4">
                        <p className="text-sm font-semibold text-gray-700 mb-3">
                          Delete this post?
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => deletePost(post.id)}
                            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                <div className="bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg shadow-lg p-6 text-center">
                  <h3 className="text-xl font-bold mb-2">✅ Schedule Ready!</h3>
                  <p>Your posts are scheduled and ready to go.</p>
                  <p className="text-sm mt-2 opacity-90">
                    Posting {settings.postFrequency.replace('-', ' ')} at {convertTo12Hour(settings.preferredTime)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <Calendar className="mx-auto mb-4 text-gray-400" size={64} />
                <p className="text-gray-500 text-lg">No posts scheduled yet!</p>
                <p className="text-gray-400 mt-2">Go to Upload & Edit to add images and create your schedule.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
