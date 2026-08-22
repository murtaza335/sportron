importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCABR8ZprppxgJQQOOqz0_CCm7PG635q9c",
  authDomain: "t3seecs-35e0f.firebaseapp.com",
  projectId: "t3seecs-35e0f",
  storageBucket: "t3seecs-35e0f.firebasestorage.app",
  messagingSenderId: "863351819444",
  appId: "1:863351819444:web:d45b7a5670f7ba15e1dbe1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "Update", {
    body: body,
    icon: icon || "/apple-touch-icon.png",
  });
});
