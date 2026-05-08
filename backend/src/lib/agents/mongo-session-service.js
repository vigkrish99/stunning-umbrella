/**
 * MongoDB Session Service for ADK
 * Stores agent conversation sessions in MongoDB (existing connection).
 * Drop-in replacement for InMemorySessionService / DatabaseSessionService.
 *
 * Collection: agentSessions
 * Document shape: { _id, sessionId, appName, userId, state, events, lastUpdateTime }
 */

import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    appName: { type: String, required: true },
    userId: { type: String, required: true },
    state: { type: mongoose.Schema.Types.Mixed, default: {} },
    events: { type: [mongoose.Schema.Types.Mixed], default: [] },
    lastUpdateTime: { type: Number, default: Date.now },
  },
  { timestamps: true }
);

SessionSchema.index({ appName: 1, userId: 1, sessionId: 1 }, { unique: true });
SessionSchema.index({ appName: 1, userId: 1 });

const SessionModel =
  mongoose.models.AgentSession ||
  mongoose.model('AgentSession', SessionSchema);

export class MongoSessionService {
  async createSession({ appName, userId, sessionId, state }) {
    const doc = await SessionModel.findOneAndUpdate(
      { appName, userId, sessionId },
      {
        appName,
        userId,
        sessionId,
        state: state || {},
        events: [],
        lastUpdateTime: Date.now(),
      },
      { upsert: true, new: true }
    );

    return {
      id: doc.sessionId,
      appName: doc.appName,
      userId: doc.userId,
      state: doc.state || {},
      events: doc.events || [],
      lastUpdateTime: doc.lastUpdateTime,
    };
  }

  async getSession({ appName, userId, sessionId }) {
    const doc = await SessionModel.findOne({ appName, userId, sessionId }).lean();
    if (!doc) return null;

    return {
      id: doc.sessionId,
      appName: doc.appName,
      userId: doc.userId,
      state: doc.state || {},
      events: doc.events || [],
      lastUpdateTime: doc.lastUpdateTime,
    };
  }

  async listSessions({ appName, userId }) {
    const docs = await SessionModel.find({ appName, userId })
      .sort({ lastUpdateTime: -1 })
      .lean();

    return docs.map((doc) => ({
      id: doc.sessionId,
      appName: doc.appName,
      userId: doc.userId,
      state: doc.state || {},
      events: doc.events || [],
      lastUpdateTime: doc.lastUpdateTime,
    }));
  }

  async deleteSession({ appName, userId, sessionId }) {
    await SessionModel.deleteOne({ appName, userId, sessionId });
  }

  async appendEvent({ session, event }) {
    await SessionModel.updateOne(
      { appName: session.appName, userId: session.userId, sessionId: session.id },
      {
        $push: { events: event },
        $set: {
          state: event.actions?.stateDelta
            ? { ...session.state, ...event.actions.stateDelta }
            : session.state,
          lastUpdateTime: Date.now(),
        },
      }
    );

    // Update the in-memory session object for the runner
    session.events.push(event);
    if (event.actions?.stateDelta) {
      Object.assign(session.state, event.actions.stateDelta);
    }
    session.lastUpdateTime = Date.now();
  }
}
