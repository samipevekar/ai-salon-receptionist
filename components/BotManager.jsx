'use client';

import { useState, useEffect } from 'react';
import { FiEdit, FiTrash2, FiCopy, FiEye, FiPlus, FiCheck } from 'react-icons/fi';

export default function BotManager() {
  const [bots, setBots] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBot, setEditingBot] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt: `You are the virtual receptionist for GlowMe Salon. Assist customers with appointments, stylist availability, and service details. Respond politely and gather required booking information. Always ask for appointment ID or name first, then use functions to fetch details.`,
    webhook_url: ''
  });
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/bots');
      const data = await response.json();
      setBots(data);
    } catch (error) {
      console.error('Error fetching bots:', error);
      alert('Error fetching bots: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const url = editingBot ? `/api/bots?id=${editingBot.id}` : '/api/bots';
    const method = editingBot ? 'PUT' : 'POST';

    try {
      setLoading(true);
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (response.ok) {
        fetchBots();
        resetForm();
        alert(editingBot ? 'Bot updated successfully!' : 'Bot created successfully!');
      } else {
        alert(`Error: ${result.error || 'Failed to save bot'}`);
      }
    } catch (error) {
      console.error('Error saving bot:', error);
      alert('Error saving bot: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this bot?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/bots?id=${id}`, { 
        method: 'DELETE' 
      });
      
      const result = await response.json();
      
      if (response.ok) {
        fetchBots();
        alert('Bot deleted successfully!');
      } else {
        alert(`Error: ${result.error || 'Failed to delete bot'}`);
      }
    } catch (error) {
      console.error('Error deleting bot:', error);
      alert('Error deleting bot: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (bot) => {
    setEditingBot(bot);
    setFormData({
      name: bot.name || '',
      description: bot.description || '',
      prompt: bot.prompt || '',
      webhook_url: bot.webhook_url || ''
    });
    setShowForm(true);
  };

  const copyToClipboard = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      prompt: `You are the virtual receptionist for GlowMe Salon. Assist customers with appointments, stylist availability, and service details. Respond politely and gather required booking information. Always ask for appointment ID or name first, then use functions to fetch details.`,
      webhook_url: ''
    });
    setEditingBot(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bot Management</h2>
          <p className="text-gray-600 mt-1">Create and manage your AI salon receptionist bots</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          disabled={loading}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
        >
          {showForm ? (
            <>
              <span>Cancel</span>
            </>
          ) : (
            <>
              <FiPlus className="h-5 w-5" />
              <span>Create New Bot</span>
            </>
          )}
        </button>
      </div>

      {/* CREATE/EDIT FORM */}
      {showForm && (
        <div className="bg-gradient-to-br from-white to-purple-50 border border-purple-100 rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
              {editingBot ? (
                <FiEdit className="h-5 w-5 text-white" />
              ) : (
                <FiPlus className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {editingBot ? 'Edit Bot' : 'Create New Bot'}
              </h3>
              <p className="text-gray-600 text-sm">
                {editingBot ? 'Update your bot configuration' : 'Configure a new salon receptionist bot'}
              </p>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* BOT NAME */}
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Bot Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white"
                  placeholder="Salon Receptionist"
                  required
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">Give your bot a descriptive name</p>
              </div>
              
              {/* WEBHOOK URL */}
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Webhook URL
                </label>
                <input
                  type="url"
                  value={formData.webhook_url}
                  onChange={(e) => setFormData({...formData, webhook_url: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white"
                  placeholder="https://your-ngrok-url.ngrok.io"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">For OpenMic webhook integration</p>
              </div>
            </div>
            
            {/* DESCRIPTION */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white min-h-[100px]"
                placeholder="Describe what this bot does..."
                rows="3"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">Optional description of the bot's purpose</p>
            </div>
            
            {/* SYSTEM PROMPT */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                System Prompt <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <textarea
                  value={formData.prompt}
                  onChange={(e) => setFormData({...formData, prompt: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white min-h-[200px] font-mono text-sm"
                  rows="6"
                  required
                  disabled={loading}
                />
                <div className="absolute bottom-3 right-3 text-xs text-gray-400">
                  {formData.prompt.length} characters
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Instructions that guide the bot's behavior</p>
            </div>
            
            {/* FORM BUTTONS */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-200 font-medium flex-1 flex items-center justify-center gap-2 shadow-md"
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : editingBot ? (
                  <>
                    <FiCheck className="h-5 w-5" />
                    Update Bot
                  </>
                ) : (
                  <>
                    <FiPlus className="h-5 w-5" />
                    Create Bot
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 font-medium flex-1"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LOADING STATE */}
      {loading && !showForm && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading bots...</p>
        </div>
      )}

      {/* BOTS GRID */}
      {!loading && bots.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bots.map((bot) => (
            <div 
              key={bot.id} 
              className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
            >
              {/* BOT HEADER */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                      <FiEye className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate text-lg">{bot.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded-full font-medium">
                          Salon Bot
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(bot.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(bot)}
                    disabled={loading}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors duration-200 disabled:opacity-50"
                    title="Edit Bot"
                  >
                    <FiEdit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(bot.id)}
                    disabled={loading}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors duration-200 disabled:opacity-50"
                    title="Delete Bot"
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* DESCRIPTION */}
              {bot.description && (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 line-clamp-2">{bot.description}</p>
                </div>
              )}
              
              {/* BOT ID SECTION */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bot ID</span>
                  <button
                    onClick={() => copyToClipboard(bot.id)}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
                  >
                    {copiedId === bot.id ? (
                      <>
                        <FiCheck className="h-3 w-3" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <FiCopy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <code className="text-xs font-mono text-gray-800 break-all">
                    {bot.id}
                  </code>
                </div>
              </div>
              
              {/* WEBHOOK SECTION */}
              {bot.webhook_url && (
                <div className="pt-4 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Webhook</span>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <code className="text-xs font-mono text-gray-600 break-all">
                      {bot.webhook_url}
                    </code>
                  </div>
                </div>
              )}
              
              {/* BOT PROMPT PREVIEW */}
              <div className="pt-4 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Prompt Preview</span>
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-lg p-3 max-h-20 overflow-y-auto">
                  <p className="text-xs text-gray-700 line-clamp-2 italic">
                    {bot.prompt.substring(0, 150)}...
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading && bots.length === 0 && !showForm && (
        <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-300">
          <div className="w-20 h-20 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiEye className="h-10 w-10 text-purple-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No Bots Yet</h3>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            Create your first salon receptionist bot to get started with AI-powered customer service.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 font-medium inline-flex items-center gap-2 shadow-md"
          >
            <FiPlus className="h-5 w-5" />
            Create Your First Bot
          </button>
        </div>
      )}
    </div>
  );
}