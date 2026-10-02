import Link, { type LinkProps } from 'next/link';

/** In-text link with the shared link style (reference/48 S19). Use for links inside sentences and table cells. */
export default function TextLink({ children, ...props }: LinkProps & { children: React.ReactNode; className?: string; 'aria-label'?: string }) {
  return <Link {...props}>{children}</Link>;
}
