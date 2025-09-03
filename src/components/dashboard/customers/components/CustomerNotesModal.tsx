'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { type Customer } from '../types';
import { MessageSquare, Calendar, User, X, Save } from '@/components/ui/icons';

interface CustomerNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSave?: (notes: string) => void;
}

interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
  type: 'manual' | 'system';
}

export function CustomerNotesModal({ isOpen, onClose, customer, onSave }: CustomerNotesModalProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && customer) {
      loadNotes();
    }
  }, [isOpen, customer]);

  const loadNotes = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}/notes`);
      const data = await response.json();

      if (data.success) {
        setNotes(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!customer || !newNote.trim()) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newNote.trim(),
          type: 'manual',
        }),
      });

      if (response.ok) {
        setNewNote('');
        await loadNotes();
        onSave?.(newNote.trim());
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!customer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Notes" size="lg">
      <div className="space-y-6">
        {/* Customer Header */}
        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">
              {customer.firstName} {customer.lastName}
            </h3>
            <p className="text-sm text-gray-500">{customer.email}</p>
          </div>
        </div>

        {/* Add New Note */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Add New Note</label>
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Enter your note about this customer..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSaveNote}
              disabled={!newNote.trim() || saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Note'}</span>
            </button>
          </div>
        </div>

        {/* Notes List */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-900 flex items-center space-x-2">
            <MessageSquare className="w-4 h-4" />
            <span>Notes History</span>
          </h4>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p>No notes yet</p>
              <p className="text-sm">Add your first note above</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.map(note => (
                <div
                  key={note.id}
                  className={`p-3 rounded-lg border ${
                    note.type === 'system'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-gray-600">
                      {note.type === 'system' ? 'System' : 'Manual'}
                    </span>
                    <div className="flex items-center text-xs text-gray-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formatDate(note.createdAt)}
                    </div>
                  </div>
                  <p className="text-sm text-charcoal whitespace-pre-wrap">{note.content}</p>
                  {note.createdBy && (
                    <p className="text-xs text-gray-500 mt-1">by {note.createdBy}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-charcoal transition-colors flex items-center space-x-2"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
