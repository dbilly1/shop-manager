"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScanLine, CameraOff } from "lucide-react"

interface Props {
  open: boolean
  onScan: (code: string) => void
  onClose: () => void
  title?: string
}

export function BarcodeScanner({ open, onScan, onClose, title = "Scan Barcode" }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const [error, setError]     = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!open) return

    let stopped = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controls: any = null

    async function startScanner() {
      setError(null)
      setScanning(true)
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser")
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, err, ctrl) => {
            controls = ctrl
            if (stopped) { ctrl?.stop(); return }
            if (result) {
              ctrl?.stop()
              onScan(result.getText())
              onClose()
            }
          }
        )
      } catch (e) {
        if (!stopped) {
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera permission denied. Please allow camera access and try again."
              : "Unable to access camera."
          )
          setScanning(false)
        }
      }
    }

    startScanner()

    return () => {
      stopped = true
      try { controls?.stop() } catch { /* ignore */ }
      setScanning(false)
    }
  }, [open, onScan, onClose])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CameraOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-square">
              {/* Camera feed */}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* Dimmed corners */}
                <div className="absolute inset-0 bg-black/40" />
                {/* Scan frame */}
                <div className="relative z-10 w-52 h-52">
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br" />
                  {/* Scanning line animation */}
                  {scanning && (
                    <div className="absolute left-1 right-1 h-0.5 bg-primary/80 shadow-[0_0_6px_2px] shadow-primary/50 animate-scan" />
                  )}
                </div>
              </div>
              {/* Hint text */}
              <p className="absolute bottom-3 left-0 right-0 text-center text-white text-xs z-20">
                Point camera at barcode
              </p>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
