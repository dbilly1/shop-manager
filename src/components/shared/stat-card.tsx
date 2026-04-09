import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  title: string
  value: string
  sub?: string
  icon?: React.ReactNode
  trend?: { value: string; positive: boolean }
  className?: string
}

export function StatCard({ title, value, sub, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            {trend && (
              <p className={cn("text-xs mt-1", trend.positive ? "text-green-600" : "text-red-600")}>
                {trend.positive ? "+" : ""}{trend.value}
              </p>
            )}
          </div>
          {icon && (
            <div className="rounded-md bg-muted p-2 shrink-0">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
