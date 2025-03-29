declare module 'react-simple-captcha' {
  export function loadCaptchaEnginge(
    chars?: number,
    backgroundColor?: string,
    fontColor?: string,
    fontSize?: string,
  ): void;
  
  export function validateCaptcha(
    userCaptchaValue: string, 
    removeValue?: boolean
  ): boolean;
  
  export function LoadCanvasTemplate(): JSX.Element;
  export function LoadCanvasTemplateNoReload(): JSX.Element;
  export function loadCaptchaEngingeWithCallback(callbackFunction: () => void): void;
}