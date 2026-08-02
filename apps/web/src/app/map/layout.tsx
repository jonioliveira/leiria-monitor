export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-10">
      {children}
    </div>
  );
}
