import { useClickOutside } from '@/hooks';
import { cn } from '@/utils';
import { useRef, type PropsWithChildren } from 'react';

interface Props {
  className?: string;
  onClose: () => void;
}

export const Modal = ({ children, className, onClose }: PropsWithChildren<Props>) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useClickOutside(modalRef, onClose);

  return (
    <div
      className={cn(
        'fixed inset-0 overflow-hidden flex items-center justify-center z-1000 py-10 bg-[rgba(0,0,0,0.7)]',
        className
      )}
    >
      <div
        ref={modalRef}
        className="flex flex-col bg-[#0a0a0d] rounded-2xl pt-4.5 w-full max-w-4/5 md:max-w-1/5 gap-y-4 h-full"
      >
        {children}
      </div>
    </div>
  );
};
