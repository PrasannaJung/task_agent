import { useState, useRef, useEffect } from 'react';
import { api } from '../api/client';
import { Send, Plus, Trash2, Clock, Loader2, Check, X } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface FoundTask {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  matchScore: number;
  matchReason: string;
}

interface UserIntent {
  action: 'create' | 'update' | 'delete' | 'complete' | 'list' | 'chat';
  confidence: number;
  reason: string;
  extractedInfo?: {
    title?: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    status?: string;
    searchQuery?: string;
  };
}

interface OperationDetails {
  action: string;
  taskId?: string;
  updates?: any;
}

interface ChatSession {
  _id: string;
  title: string;
  lastActivity: string;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [pendingTaskInfo, setPendingTaskInfo] = useState<any>(null);
  const [foundTasks, setFoundTasks] = useState<FoundTask[]>([]);
  const [userIntent, setUserIntent] = useState<UserIntent | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [operationDetails, setOperationDetails] = useState<OperationDetails | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const data = await api.getChatSessions();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const data = await api.getChatSession(sessionId);
      setMessages(
        data.session.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }))
      );
      setCurrentSessionId(sessionId);
      setPendingTaskInfo(data.session.pendingTask);
      setFoundTasks(data.session.foundTasks || []);
      setUserIntent(data.session.userIntent || null);
      setAwaitingConfirmation(data.session.awaitingConfirmation || false);
      setOperationDetails(data.session.operationDetails || null);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteChatSession(sessionId);
      setSessions(sessions.filter((s) => s._id !== sessionId));
      if (currentSessionId === sessionId) {
        setMessages([]);
        setCurrentSessionId(undefined);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentSessionId(undefined);
    setPendingTaskInfo(null);
    setFoundTasks([]);
    setUserIntent(null);
    setAwaitingConfirmation(false);
    setOperationDetails(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: new Date() },
    ]);

    try {
      const data = await api.sendMessage(userMessage, currentSessionId);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, timestamp: new Date() },
      ]);

      setCurrentSessionId(data.sessionId);
      setPendingTaskInfo(data.hasPendingTask ? data.pendingTask : null);
      setFoundTasks(data.foundTasks || []);
      setUserIntent(data.userIntent || null);
      setAwaitingConfirmation(data.awaitingConfirmation || false);
      setOperationDetails(data.operationDetails || null);

      // Refresh sessions list
      loadSessions();
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleConfirmation = async (confirmed: boolean) => {
    if (isLoading) return;
    
    const message = confirmed ? 'yes' : 'no';
    
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: confirmed ? 'Yes' : 'No', timestamp: new Date() },
    ]);
    
    setIsLoading(true);
    
    try {
      const data = await api.sendMessage(message, currentSessionId);
      
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, timestamp: new Date() },
      ]);
      
      setCurrentSessionId(data.sessionId);
      setPendingTaskInfo(data.hasPendingTask ? data.pendingTask : null);
      setFoundTasks(data.foundTasks || []);
      setUserIntent(data.userIntent || null);
      setAwaitingConfirmation(data.awaitingConfirmation || false);
      setOperationDetails(data.operationDetails || null);
      
      loadSessions();
    } catch (error) {
      console.error('Failed to send confirmation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Sidebar - Chat History */}
      <div className="w-64 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingSessions ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No chat history
            </p>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session._id}
                  onClick={() => loadSession(session._id)}
                  className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    currentSessionId === session._id
                      ? 'bg-primary-50 border border-primary-200'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(session.lastActivity).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteSession(session._id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-3xl">👋</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Welcome to Task AI
              </h3>
              <p className="text-gray-600 max-w-md mb-6">
                I can help you create and manage tasks. Try saying something
                like:
              </p>
              <div className="space-y-2 text-sm">
                <p className="px-4 py-2 bg-gray-100 rounded-lg">
                  &ldquo;I need to buy groceries tomorrow at 5 PM&rdquo;
                </p>
                <p className="px-4 py-2 bg-gray-100 rounded-lg">
                  &ldquo;Remind me to call mom on Friday&rdquo;
                </p>
                <p className="px-4 py-2 bg-gray-100 rounded-lg">
                  &ldquo;Create a high priority task for the report due Monday&rdquo;
                </p>
                <p className="px-4 py-2 bg-blue-50 text-blue-800 rounded-lg">
                  &ldquo;I finished the report&rdquo; (mark as complete)
                </p>
                <p className="px-4 py-2 bg-blue-50 text-blue-800 rounded-lg">
                  &ldquo;Move my meeting to next week&rdquo; (update task)
                </p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div
                  className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-900 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      message.role === 'user'
                        ? 'text-primary-100'
                        : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                🤖
              </div>
              <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.1s' }}
                  />
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.2s' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Context Banner - Shows pending task, found tasks, or confirmation */}
        {(pendingTaskInfo?.missingFields?.length > 0 || foundTasks.length > 0 || awaitingConfirmation) && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 max-h-48 overflow-y-auto">
            {/* Pending Task Info */}
            {pendingTaskInfo?.missingFields?.length > 0 && (
              <div className="flex items-center gap-2 text-amber-800 text-sm mb-2">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>
                  Creating task... Missing:{' '}
                  {pendingTaskInfo.missingFields.join(', ')}
                </span>
              </div>
            )}

            {/* User Intent Display */}
            {userIntent && userIntent.action !== 'chat' && (
              <div className="flex items-center gap-2 text-blue-800 text-sm mb-2">
                <span className="font-medium capitalize">{userIntent.action}</span>
                <span className="text-blue-600">({Math.round(userIntent.confidence * 100)}% confidence)</span>
              </div>
            )}

            {/* Found Tasks for Selection */}
            {foundTasks.length > 0 && !awaitingConfirmation && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Found {foundTasks.length} task{foundTasks.length !== 1 ? 's' : ''}:
                </p>
                {foundTasks.slice(0, 5).map((task, idx) => (
                  <div 
                    key={task._id} 
                    className="flex items-start gap-2 text-sm bg-white p-2 rounded border border-amber-200"
                  >
                    <span className="font-medium text-gray-900 min-w-[1.5rem]">{idx + 1}.</span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500">
                        {task.status} • {task.priority} priority
                        {task.dueDate && ` • Due ${new Date(task.dueDate).toLocaleDateString()}`}
                      </p>
                      {task.matchReason && (
                        <p className="text-xs text-green-600 mt-1">{task.matchReason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Confirmation State */}
            {awaitingConfirmation && foundTasks.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-amber-900">
                  {userIntent?.action === 'complete' && 'Mark this task as complete?'}
                  {userIntent?.action === 'delete' && 'Delete this task?'}
                  {userIntent?.action === 'update' && 'Update this task?'}
                  {!['complete', 'delete', 'update'].includes(userIntent?.action || '') && 'Please confirm the action:'}
                </p>
                {foundTasks.slice(0, 1).map((task) => (
                  <div 
                    key={task._id} 
                    className="flex items-start gap-2 text-sm bg-white p-3 rounded border-2 border-amber-300"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500">
                        {task.status} • {task.priority} priority
                        {task.dueDate && ` • Due ${new Date(task.dueDate).toLocaleDateString()}`}
                      </p>
                      {operationDetails?.updates && Object.keys(operationDetails.updates).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs text-amber-700 font-medium">Changes:</p>
                          {operationDetails.updates.title && (
                            <p className="text-xs text-gray-600">Title: {operationDetails.updates.title}</p>
                          )}
                          {operationDetails.updates.dueDate && (
                            <p className="text-xs text-gray-600">Due: {new Date(operationDetails.updates.dueDate).toLocaleDateString()}</p>
                          )}
                          {operationDetails.updates.priority && (
                            <p className="text-xs text-gray-600">Priority: {operationDetails.updates.priority}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleConfirmation(true)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    Yes
                  </button>
                  <button
                    onClick={() => handleConfirmation(false)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="h-4 w-4" />
                    No
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="px-4 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
