import mongoose from 'mongoose';

const costOverrideSchema = new mongoose.Schema({
  customerId: { type: String, required: true, index: true },
  productCode: { type: String, required: true },
  costPrice: { type: Number, required: true, min: 0 },
  updatedBy: { type: String, default: 'manual' }
}, { timestamps: true });

costOverrideSchema.index({ customerId: 1, productCode: 1 }, { unique: true });

export default mongoose.model('CostOverride', costOverrideSchema);
