import { notFound } from 'next/navigation';
import DesignGallery from './gallery';
export default function DesignGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DesignGallery />;
}
