import mongoose from 'mongoose';

const userPreferencesSchema = new mongoose.Schema({
  modelBehavior: {
    type: String,
    enum: ['formal', 'casual', 'friendly', 'professional'],
    default: 'professional'
  },
  responseStyle: {
    type: String,
    enum: ['concise', 'detailed', 'step-by-step'],
    default: 'detailed'
  },
  taskReminders: {
    type: Boolean,
    default: true
  },
  priorityLevel: {
    type: String,
    enum: ['all', 'high-and-medium', 'high-only'],
    default: 'all'
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  preferences: {
    type: userPreferencesSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

export default User;