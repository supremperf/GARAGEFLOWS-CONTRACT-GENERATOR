import { useRef, type ChangeEventHandler, type ReactNode } from 'react';

/** Real button instead of an unfocusable label hiding its file input. */
export default function FilePicker({ className, accept, onChange, children }: {
  className: string;
  accept?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" className={className} onClick={() => ref.current?.click()}>{children}</button>
    <input ref={ref} hidden type="file" accept={accept} onChange={onChange} />
  </>;
}
