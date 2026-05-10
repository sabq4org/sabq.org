declare module 'passport-apple' {
  import { Strategy } from 'passport';
  
  interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    privateKeyString?: string;
    privateKeyLocation?: string;
    callbackURL: string;
    passReqToCallback?: boolean;
    scope?: string[];
  }
  
  type AppleVerifyCallback = (
    req: any,
    accessToken: string,
    refreshToken: string,
    idToken: string,
    profile: any,
    done: (error: any, user?: any, info?: any) => void
  ) => void;
  
  class AppleStrategy extends Strategy {
    constructor(options: AppleStrategyOptions, verify: AppleVerifyCallback);
  }
  
  export = AppleStrategy;
}
