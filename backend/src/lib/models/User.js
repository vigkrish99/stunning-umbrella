/**
 * User Model
 * RBAC roles: owner, manager, sales.
 */

import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      unique: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'manager', 'sales'],
      default: 'sales',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ role: 1 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;
