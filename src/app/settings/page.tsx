'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ArrowLeft, Instagram, Loader2, LogOut, UserPlus, X, Users
} from 'lucide-react';

interface ConnectedAccount {
  id: number;
  identifier: string;
  displayName: string;
  profilePicture: string | null;
  postingFrequency: string;
}

interface Collaborator {
  id: number;
  username: string;
  displayName: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [postingFrequency, setPostingFrequency] = useState('daily');
  const [queuePaused, setQueuePaused] = useState(false);
  
  // Collaborators state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [newCollaboratorUsername, setNewCollaboratorUsername] = useState('');
  const [addingCollaborator, setAddingCollaborator] = useState(false);
  const [deletingCollaboratorId, setDeletingCollaboratorId] = useState<number | null>(null);

  const frequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'every-other-day', label: 'Every Other Day' },
    { value: '3x-week', label: '3x per Week (M/W/F)' },
    { value: 'weekdays', label: 'Weekdays Only' },
  ];

  const loadAccount = useCallback(async () => {
    try {
      // Load account info
      const accountRes = await fetch('/api/accounts');
      if (accountRes.ok) {
        const data = await accountRes.json();
        if (data.stored && data.stored.length > 0) {
          setAccount(data.stored[0]);
        }
      }
      
      // Load settings (includes queuePaused)
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setPostingFrequency(settings.postingFrequency);
        setQueuePaused(settings.queuePaused ?? false);
      }
    } catch (error) {
      console.error('Error loading account:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCollaborators = useCallback(async () => {
    try {
      const res = await fetch('/api/collaborators');
      if (res.ok) {
        setCollaborators(await res.json());
      }
    } catch (error) {
      console.error('Error loading collaborators:', error);
    }
  }, []);

  useEffect(() => {
    loadAccount();
    loadCollaborators();
  }, [loadAccount, loadCollaborators]);

  async function updateFrequency(frequency: string) {
    setPostingFrequency(frequency);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postingFrequency: frequency }),
      });
    } catch (error) {
      console.error('Error updating frequency:', error);
    }
  }

  async function toggleQueuePaused() {
    const newValue = !queuePaused;
    setQueuePaused(newValue);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queuePaused: newValue }),
      });
    } catch (error) {
      console.error('Error updating queue pause:', error);
      setQueuePaused(!newValue); // Revert on error
    }
  }

  async function addCollaborator() {
    if (!newCollaboratorUsername.trim()) return;
    
    setAddingCollaborator(true);
    try {
      const res = await fetch('/api/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newCollaboratorUsername.trim() }),
      });
      if (res.ok) {
        setNewCollaboratorUsername('');
        await loadCollaborators();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to add collaborator');
      }
    } catch (error) {
      console.error('Error adding collaborator:', error);
    } finally {
      setAddingCollaborator(false);
    }
  }

  async function deleteCollaborator(id: number) {
    setDeletingCollaboratorId(id);
    try {
      const res = await fetch(`/api/collaborators/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadCollaborators();
      }
    } catch (error) {
      console.error('Error deleting collaborator:', error);
    } finally {
      setDeletingCollaboratorId(null);
    }
  }

  async function handleLogout() {
    await signOut({ callbackUrl: '/login' });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e1f22] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1f22] p-3 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1 sm:gap-2 text-gray-400 hover:text-gray-200 transition-colors text-sm sm:text-base"
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm sm:text-base"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>

        {/* Connected Account */}
        <div className="bg-[#2b2d31] rounded-lg shadow-lg p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-bold text-gray-100 mb-3 sm:mb-4">Connected Account</h2>
          
          {account ? (
            <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-purple-500/20 border border-purple-500/50 rounded-lg">
              {account.profilePicture ? (
                <img
                  src={account.profilePicture}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Instagram size={28} className="text-white" />
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-100 text-lg">@{account.identifier}</p>
                <p className="text-gray-400">{account.displayName}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Instagram className="mx-auto mb-4 opacity-50" size={48} />
              <p>No account connected</p>
            </div>
          )}

          <p className="text-sm text-gray-500 mt-4">
            To use a different Instagram account, log out and sign in with the other account.
          </p>
        </div>

        {/* Posting Settings */}
        {account && (
          <div className="bg-[#2b2d31] rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-100 mb-4">Posting Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Posting Frequency
                </label>
                <select
                  value={postingFrequency}
                  onChange={(e) => updateFrequency(e.target.value)}
                  className="w-full bg-[#383a40] border border-[#4a4d55] text-gray-200 rounded-lg px-4 py-2"
                >
                  {frequencyOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Pause Queue Toggle */}
              <div 
                onClick={toggleQueuePaused}
                className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-colors ${
                  queuePaused 
                    ? 'bg-yellow-500/20 border border-yellow-500/50' 
                    : 'bg-[#383a40] hover:bg-[#43454d]'
                }`}
              >
                <div>
                  <p className={`font-semibold ${queuePaused ? 'text-yellow-300' : 'text-gray-200'}`}>
                    {queuePaused ? '⏸️ Queue Paused' : 'Queue Active'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {queuePaused 
                      ? 'Queue posts will not publish automatically' 
                      : 'Queue posts will publish on schedule'}
                  </p>
                </div>
                <div className={`w-12 h-6 rounded-full relative transition-colors ${
                  queuePaused ? 'bg-yellow-500' : 'bg-gray-600'
                }`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    queuePaused ? 'left-7' : 'left-1'
                  }`} />
                </div>
              </div>

              <div className="p-4 bg-blue-500/20 rounded-lg">
                <p className="text-blue-300 text-sm">
                  <strong>Note:</strong> All posts are published at <strong>3:00 PM ET</strong> daily.
                  The frequency setting controls which days posts go out.
                  {queuePaused && <><br /><strong className="text-yellow-300">Queue is paused</strong> — scheduled posts and "Post Now" still work.</>}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Frequent Collaborators */}
        {account && (
          <div className="bg-[#2b2d31] rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <Users size={20} className="text-purple-400" />
              Frequent Collaborators
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Add Instagram usernames you frequently collaborate with. You can select up to 3 per post.
            </p>

            {/* Add new collaborator */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                <input
                  type="text"
                  value={newCollaboratorUsername}
                  onChange={(e) => setNewCollaboratorUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCollaborator()}
                  placeholder="username"
                  className="w-full bg-[#383a40] border border-[#4a4d55] text-gray-200 rounded-lg pl-8 pr-4 py-2"
                />
              </div>
              <button
                onClick={addCollaborator}
                disabled={addingCollaborator || !newCollaboratorUsername.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {addingCollaborator ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <UserPlus size={16} />
                )}
                Add
              </button>
            </div>

            {/* List of collaborators */}
            {collaborators.length > 0 ? (
              <div className="space-y-2">
                {collaborators.map(collab => (
                  <div
                    key={collab.id}
                    className="flex items-center justify-between p-3 bg-[#383a40] rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Instagram size={14} className="text-white" />
                      </div>
                      <span className="text-gray-200">@{collab.username}</span>
                    </div>
                    <button
                      onClick={() => deleteCollaborator(collab.id)}
                      disabled={deletingCollaboratorId === collab.id}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deletingCollaboratorId === collab.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <X size={16} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Users className="mx-auto mb-2 opacity-50" size={32} />
                <p>No collaborators added yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
