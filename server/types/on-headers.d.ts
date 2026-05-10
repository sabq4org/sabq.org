declare module 'on-headers' {
  import { ServerResponse } from 'http';
  
  function onHeaders(res: ServerResponse, listener: (this: ServerResponse) => void): void;
  
  export = onHeaders;
}
