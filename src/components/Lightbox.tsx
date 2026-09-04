export function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  return (
    <button
      type="button"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <img src={src} alt={alt || "放大查看"} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" />
    </button>
  );
}
