import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#142b35',
};
export const metadata: Metadata = {
  title: 'Beach Head — Battle Stations',
  description:
    'Take command of the forward guns. A focused 3D naval combat game inspired by the 1983 classic.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
