type FullscreenRoot=HTMLElement&{
  webkitRequestFullscreen?:()=>Promise<void>|void;
};

type WebkitFullscreenDocument=Document&{
  webkitFullscreenElement?:Element|null;
};

export class FullscreenController {
  private touchAttempted=false;

  constructor(signal:AbortSignal) {
    window.addEventListener('pointerdown',event=>{
      if (event.pointerType!=='touch' || this.touchAttempted) return;
      this.touchAttempted=true;
      this.request();
    },{passive:true,signal});
  }

  request():void {
    const webkitDocument=document as WebkitFullscreenDocument;
    if (document.fullscreenElement || webkitDocument.webkitFullscreenElement) return;
    const root=document.documentElement as FullscreenRoot;
    try {
      const result=root.requestFullscreen
        ? root.requestFullscreen({navigationUI:'hide'})
        : root.webkitRequestFullscreen?.call(root);
      if (result) void Promise.resolve(result).catch(()=>{});
    } catch {
      // Fullscreen remains optional when the browser rejects the request.
    }
  }
}
