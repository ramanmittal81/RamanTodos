// IMPORTANT: Replace this with your Firebase config from Firebase Console
// Get this from: Firebase Console → Project Settings → Web App Config

const firebaseConfig = {
  apiKey: "AIzaSyBhANAKsssWP-xr0SisAoBgco7BVuzrxbY4",
  authDomain: "todos-app-cbd55.firebaseapp.com",
  projectId: "todos-app-cbd55",
  storageBucket: "todos-app-cbd55.firebasestorage.app",
  messagingSenderId: "930493156025",
  appId: "1:930493156025:web:a14b1da8124b7b1a256968"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
window.auth = firebase.auth();
window.db = firebase.firestore();

// Enable offline persistence
firebase.firestore().enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.log('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
      console.log('The current browser does not support all of the features required to enable persistence');
    }
  });
