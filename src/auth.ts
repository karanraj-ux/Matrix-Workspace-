import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive'); // Upgraded to full drive for Cross-Account Transfer Magic
provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');

let isSigningIn = false;

export const initAuth = (onAuthChange: (user: User | null) => void) => {
  return onAuthStateChanged(auth, (user) => {
    if (!isSigningIn) onAuthChange(user);
  });
};

export const googleSignIn = async (forceSelectAccount = false) => {
  try {
    isSigningIn = true;
    if (forceSelectAccount) {
      provider.setCustomParameters({ prompt: 'consent select_account' });
    } else {
      provider.setCustomParameters({ prompt: 'consent' });
    }
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token');
    }
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  await auth.signOut();
};
