export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">ShopManager</h1>
          <p className="text-sm text-muted-foreground mt-1">Retail operations, simplified</p>
        </div>
        {children}
      </div>
    </div>
  )
}
