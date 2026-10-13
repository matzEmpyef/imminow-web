import { useEffect } from 'react'

/**
 * Sets the browser-tab title while the calling page is on screen and puts the previous one back
 * when it leaves. The console is "immiNow" everywhere (index.html); a page meant for someone who
 * has never heard of immiNow, such as the guardian approval page, sets its own.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
