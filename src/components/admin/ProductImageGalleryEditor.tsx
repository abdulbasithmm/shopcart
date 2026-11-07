import React, { useState, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { uploadProductImage } from '../../services/productService';
import { useToast } from '../../context/ToastContext';

export interface ProductImageGalleryEditorProps {
  images: string[];
  onChange: (updatedImages: string[]) => void;
  productId?: string;
}

interface SlotMeta {
  index: number;
  title: string;
  subtitle: string;
  isMain: boolean;
}

const SLOTS: SlotMeta[] = [
  { index: 0, title: 'Image 1: Front View', subtitle: 'Main / Primary Cover', isMain: true },
  { index: 1, title: 'Image 2: Back View', subtitle: 'Rear View', isMain: false },
  { index: 2, title: 'Image 3: Left Side View', subtitle: 'Left Angle', isMain: false },
  { index: 3, title: 'Image 4: Right Side View', subtitle: 'Right Angle', isMain: false },
];

export const ProductImageGalleryEditor: React.FC<ProductImageGalleryEditorProps> = ({
  images,
  onChange,
  productId = 'temp-product',
}) => {
  const { showToast } = useToast();
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<number, string>>({});
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  // Hidden file input refs
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  // Ensure images array has 4 slots
  const currentImages: string[] = [
    images[0] || '',
    images[1] || '',
    images[2] || '',
    images[3] || '',
  ];

  const handleProcessFile = async (file: File, slotIndex: number) => {
    // Clear previous error
    setSlotErrors((prev) => ({ ...prev, [slotIndex]: '' }));

    // 1. Validation: Allowed formats
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();

    if (!validMimes.includes(file.type.toLowerCase()) && !validExts.includes(fileExt)) {
      const errMsg = `Invalid image format (${file.type || fileExt}). Only JPG, JPEG, PNG, and WEBP files are allowed.`;
      setSlotErrors((prev) => ({ ...prev, [slotIndex]: errMsg }));
      showToast(errMsg, 'error');
      return;
    }

    // 2. Validation: Maximum 5MB size
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const errMsg = `Image exceeds 5 MB limit (${sizeMB} MB). Please choose a smaller file.`;
      setSlotErrors((prev) => ({ ...prev, [slotIndex]: errMsg }));
      showToast(errMsg, 'error');
      return;
    }

    // 3. Uploading
    setUploadingSlot(slotIndex);
    try {
      const res = await uploadProductImage(file, productId, slotIndex);
      if (res.error) {
        setSlotErrors((prev) => ({ ...prev, [slotIndex]: res.error || 'Upload failed' }));
        showToast(res.error, 'error');
      } else if (res.url) {
        const next = [...currentImages];
        next[slotIndex] = res.url;
        onChange(next);
        showToast(`${SLOTS[slotIndex].title} uploaded successfully!`, 'success');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to upload image';
      setSlotErrors((prev) => ({ ...prev, [slotIndex]: msg }));
      showToast(msg, 'error');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, slotIndex: number) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file, slotIndex);
    }
    // reset input value so re-uploading the same file works
    e.target.value = '';
  };

  const handleRemoveImage = (slotIndex: number) => {
    const next = [...currentImages];
    next[slotIndex] = '';
    onChange(next);
    setSlotErrors((prev) => ({ ...prev, [slotIndex]: '' }));
    showToast(`${SLOTS[slotIndex].title} removed`, 'info');
  };

  const handleTriggerUpload = (slotIndex: number) => {
    fileInputRefs.current[slotIndex]?.click();
  };

  const handleDrop = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file, slotIndex);
    }
  };

  const countUploaded = currentImages.filter(Boolean).length;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-[#0b5c37]" />
              <span>Product Image Gallery (4 Dedicated Views)</span>
            </label>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#0b5c37] border border-emerald-200">
              {countUploaded} of 4 Uploaded
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Image 1 is used as the primary storefront image. Views 2–4 provide angle zoom on the product page.
          </p>
        </div>
      </div>

      {/* 4 Image Slots Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SLOTS.map((slot) => {
          const imgUrl = currentImages[slot.index];
          const isUploading = uploadingSlot === slot.index;
          const errorMsg = slotErrors[slot.index];
          const isDragOver = dragOverSlot === slot.index;

          return (
            <div
              key={slot.index}
              className={`relative rounded-2xl border transition-all flex flex-col p-2.5 ${
                slot.isMain
                  ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                  : 'border-slate-200 bg-slate-50/50'
              } ${isDragOver ? 'border-[#0b5c37] ring-2 ring-[#0b5c37]/20 bg-emerald-50/40' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSlot(slot.index);
              }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(e) => handleDrop(e, slot.index)}
            >
              {/* Slot Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1 truncate">
                  {slot.title}
                </span>
                {slot.isMain ? (
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#0b5c37] text-white shrink-0">
                    Main
                  </span>
                ) : (
                  <span className="text-[9px] font-medium text-slate-400 shrink-0">
                    Optional
                  </span>
                )}
              </div>

              {/* Slot Image Canvas / Upload Target */}
              <div className="relative w-full h-32 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center group">
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                    <RefreshCw className="w-5 h-5 text-[#0b5c37] animate-spin" />
                    <span className="text-[10px] font-bold text-slate-700">Uploading...</span>
                    <span className="text-[9px] text-slate-400">Processing to storage</span>
                  </div>
                ) : imgUrl ? (
                  <>
                    <img
                      src={imgUrl}
                      alt={slot.title}
                      className="w-full h-full object-contain p-2 select-none"
                    />

                    {/* Action Hover Overlay */}
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                      <button
                        type="button"
                        onClick={() => handleTriggerUpload(slot.index)}
                        className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-800 text-[10px] font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1"
                        title="Replace this image"
                      >
                        <RefreshCw className="w-3 h-3 text-[#0b5c37]" />
                        <span>Replace</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(slot.index)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1"
                        title="Remove image"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>

                    {/* Quick Badge */}
                    <div className="absolute bottom-1.5 right-1.5 bg-slate-900/70 text-white rounded px-1.5 py-0.5 text-[9px] font-mono pointer-events-none flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Ready</span>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTriggerUpload(slot.index)}
                    className="w-full h-full flex flex-col items-center justify-center gap-1 p-3 text-slate-400 hover:text-[#0b5c37] hover:bg-emerald-50/30 transition-all cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-[#0b5c37] group-hover:bg-emerald-100 transition-colors">
                      <Upload className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 group-hover:text-[#0b5c37]">
                      Choose Image
                    </span>
                    <span className="text-[9px] text-slate-400">JPG, PNG, WEBP &lt; 5MB</span>
                  </button>
                )}

                {/* Hidden File Input */}
                <input
                  ref={(el) => {
                    fileInputRefs.current[slot.index] = el;
                  }}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, slot.index)}
                />
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="mt-1.5 p-1 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-1 text-[10px] text-rose-600 leading-tight">
                  <AlertCircle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
