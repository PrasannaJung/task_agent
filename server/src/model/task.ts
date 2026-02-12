import mongoose from 'mongoose';

const emailSourceSchema = new mongoose.Schema({
  emailId: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  sender: {
    type: String,
    required: true
  },
  receivedAt: {
    type: Date,
    required: true
  },
  snippet: {
    type: String,
    required: false
  }
}, { _id: false });

const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'completed'],
    default: 'todo'
  },
  dueDate: {
    type: Date,
    required: false
  },
  completedAt: {
    type: Date,
    required: false
  },
  createdByChat: {
    type: Boolean,
    default: true
  },
  chatSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatSession',
    required: false
  },
  source: {
    type: String,
    enum: ['chat', 'email', 'manual'],
    default: 'chat'
  },
  emailSource: {
    type: emailSourceSchema,
    required: false
  }
}, {
  timestamps: true
});

// Index for querying user tasks
taskSchema.index({ userId: 1, status: 1, priority: 1 });
taskSchema.index({ userId: 1, dueDate: 1 });

const Task = mongoose.model('Task', taskSchema);

export default Task;
