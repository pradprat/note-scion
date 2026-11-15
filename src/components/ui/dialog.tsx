"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const FRAME =
  "fixed z-50 gap-4 border p-6 ease-out-expo data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"

// Centred across the window, opening with a slight zoom.
const POPUP =
  "left-[50%] grid w-full max-w-lg translate-x-[-50%] bg-background shadow-lg data-[state=open]:duration-200 data-[state=closed]:duration-120 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 sm:rounded-lg"

/**
 * Where the dialog sits. "center" is the shadcn default. "top" pins its top edge, for
 * dialogs whose height changes while open (the quick switcher's results), so the input
 * stays where the eye is instead of the whole box re-centring on every keystroke.
 * "bottom" is a full-width sheet on the bottom edge that grows upward, for phones; its
 * caller sets `bottom` and `max-height` to keep it above the on-screen keyboard.
 */
const ANCHOR = {
  center: `${POPUP} top-[50%] translate-y-[-50%] data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%] motion-reduce:data-[state=closed]:slide-out-to-top-1/2 motion-reduce:data-[state=open]:slide-in-from-top-1/2`,
  top: `${POPUP} top-[12vh] sm:top-[15vh]`,
  bottom:
    "inset-x-0 bottom-0 flex flex-col rounded-t-lg border-x-0 border-b-0 bg-popover shadow-[0_-10px_15px_-3px_rgb(0_0_0/0.1),0_-4px_6px_-4px_rgb(0_0_0/0.1)] data-[state=open]:duration-240 data-[state=closed]:duration-120 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-2 motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0",
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    anchor?: keyof typeof ANCHOR
    /** Leave out the corner ×, for a dialog that brings its own way out. */
    hideClose?: boolean
  }
>(({ className, children, anchor = "center", hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(FRAME, ANCHOR[anchor], className)}
      {...props}
    >
      {children}
      {!hideClose && <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 opacity-70 [@media(pointer:coarse)]:right-1 [@media(pointer:coarse)]:top-1 [@media(pointer:coarse)]:p-3 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
