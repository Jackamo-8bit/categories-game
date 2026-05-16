# Scattergories Game + Firebase Setup  
  
Scattergories - multiplayer lobby room with custom fields and rounds (maybe an option randomised categories) - automatic score rounding 1 to 2   Project Name/Label - Categories-Game Firebase Project ID - categories-game-16c59  Firebase SDK:  // Import the functions you need from the SDKs you need  
import { initializeApp } from "firebase/app";  
// TODO: Add SDKs for Firebase products that you want to use  
// https://firebase.google.com/docs/web/setup#available-libraries  
  
// Your web app's Firebase configuration  
const firebaseConfig = {  
  apiKey: "AIzaSyBFx8DjaMW-0iBkTlOp2SpGqr0ErWlDlek",  
  authDomain: "categories-game-16c59.firebaseapp.com",  
  projectId: "categories-game-16c59",  
  storageBucket: "categories-game-16c59.firebasestorage.app",  
  messagingSenderId: "849852085736",  
  appId: "1:849852085736:web:ed1dee34004da8f23be05d"  
};  
  
// Initialize Firebase  
const app = initializeApp(firebaseConfig);  
