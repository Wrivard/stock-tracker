import { useState } from 'react'
import { TrendingUp } from 'lucide-react'

import { cn } from '@/lib/utils'

interface BrandLogoProps {
  size?: number
  className?: string
}

// The app logo. We prefer the bundled `renderer/public/logo.png` (a green
// trading-hub mark drawn by the user) but fall back to a lucide
// TrendingUp inside a primary-tinted rounded square when the asset is
// missing — keeps the UI looking intentional before the icon ships.
export function BrandLogo({ size = 28, className }: BrandLogoProps) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div
      className={cn(
        'rounded-md overflow-hidden flex items-center justify-center shrink-0',
        imgFailed && 'bg-primary/10 ring-1 ring-primary/20',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {imgFailed ? (
        <TrendingUp
          className="text-primary"
          style={{ width: size * 0.6, height: size * 0.6 }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo.png"
          alt="Beta Trading Hub logo"
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          style={{ width: size, height: size, objectFit: 'cover' }}
        />
      )}
    </div>
  )
}
