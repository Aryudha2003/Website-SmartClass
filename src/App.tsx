/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Clock, 
  Users, 
  ChevronRight, 
  Calendar, 
  Sparkles, 
  X, 
  CheckCircle2, 
  AlertCircle,
  History,
  User,
  LayoutDashboard,
  Filter,
  ArrowRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithPopup,
  signOut,
  GoogleAuthProvider
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  setDoc,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db, googleProvider } from './lib/firebase';

// --- Types ---

type RoomStatus = 'Available' | 'Occupied' | 'Cleaning';

interface Room {
  id: string;
  name: string;
  floor: string;
  capacity: number;
  status: RoomStatus;
  nextFreeTime?: string;
  facilities: string[];
  image: string;
  cleaningProgress?: number; // 0 to 100
}

interface UserBooking {
  id: string;
  roomName: string;
  startTime: any; // Can be Date or Timestamp
  durationMinutes: number;
  status: string;
}

interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

const handleFirestoreError = (error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null) => {
  if (error.code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || 'unauthenticated',
        email: auth.currentUser?.email || 'none',
        emailVerified: auth.currentUser?.emailVerified || false,
        isAnonymous: auth.currentUser?.isAnonymous || false,
        providerInfo: auth.currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || '',
        })) || []
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
};

// --- Mock Data ---

const INITIAL_ROOMS: Room[] = [
  {
    id: 'R101',
    name: 'Lab Pemrograman 1',
    floor: 'Lantai 1',
    capacity: 30,
    status: 'Available',
    facilities: ['Projector', 'PCs', 'AC', 'Whiteboard'],
    image: 'https://images.unsplash.com/photo-1541339907198-e08756eaaaf8?q=80&w=800&auto=format&fit=crop'
  },
  {
    id: 'R202',
    name: 'Ruang Seminar',
    floor: 'Lantai 2',
    capacity: 100,
    status: 'Occupied',
    nextFreeTime: '14:30',
    facilities: ['Projector', 'Sound System', 'AC'],
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?q=80&w=800&auto=format&fit=crop'
  },
  {
    id: 'R105',
    name: 'Ruang Diskusi A',
    floor: 'Lantai 1',
    capacity: 8,
    status: 'Cleaning',
    cleaningProgress: 45,
    facilities: ['AC', 'Whiteboard'],
    image: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?q=80&w=800&auto=format&fit=crop'
  },
  {
    id: 'R301',
    name: 'Lab Jaringan',
    floor: 'Lantai 3',
    capacity: 25,
    status: 'Available',
    facilities: ['Projector', 'Networking Gear', 'AC'],
    image: 'https://images.unsplash.com/photo-1558403194-611308249627?q=80&w=800&auto=format&fit=crop'
  },
  {
    id: 'R205',
    name: 'Ruang Diskusi B',
    floor: 'Lantai 2',
    capacity: 6,
    status: 'Available',
    facilities: ['AC', 'Smart TV'],
    image: 'https://images.unsplash.com/photo-1577412647305-991150c7d163?q=80&w=800&auto=format&fit=crop'
  }
];

// --- Sub-components ---

interface RoomCardProps {
  room: Room;
  onClick: () => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onClick }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="glass-card rounded-2xl overflow-hidden shadow-soft cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative h-32 overflow-hidden">
        <img 
          src={room.image} 
          alt={room.name} 
          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-3 right-3">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm backdrop-blur-md border border-white/10 ${
            room.status === 'Available' ? 'bg-emerald-500/80 text-white' :
            room.status === 'Occupied' ? 'bg-amber-500/80 text-white' :
            'bg-cyan-500/80 text-white'
          }`}>
            {room.status}
          </span>
        </div>
      </div>
      <div className="p-4 bg-white/5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-display font-bold text-white leading-tight">{room.name}</h3>
          <div className="flex items-center text-white/40 text-[10px] font-bold uppercase tracking-widest gap-1">
            <MapPin size={10} />
            <span>{room.floor}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-white/60 text-xs mb-4 font-mono">
          <div className="flex items-center gap-1">
            <Users size={12} />
            <span>{room.capacity}</span>
          </div>
          {room.status === 'Occupied' && room.nextFreeTime && (
            <div className="flex items-center gap-1 text-amber-400">
              <Clock size={12} />
              <span>{room.nextFreeTime}</span>
            </div>
          )}
          {room.status === 'Cleaning' && (
            <div className="flex-1">
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${room.cleaningProgress}%` }}
                  className="h-full bg-cyan-400 shadow-[0_0_8px_cyan]"
                />
              </div>
            </div>
          )}
        </div>

        <button className="w-full py-2 bg-white/10 text-white/70 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-400 hover:text-black transition-all border border-white/10 flex items-center justify-center gap-2">
          {room.status === 'Available' ? 'Book Now' : 'View Schedule'}
          <ChevronRight size={14} />
        </button>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile'>('dashboard');
  const [bookings, setBookings] = useState<UserBooking[]>([]);

  // Test Connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);

      if (currentUser) {
        // Sync user profile
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, {
          userId: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          lastActive: new Date().toISOString()
        }, { merge: true });
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time Bookings
  useEffect(() => {
    if (!user) {
      setBookings([]);
      return;
    }

    const q = query(
      collection(db, 'bookings'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserBooking[];
      setBookings(fetchedBookings);
    });

    return () => unsubscribe();
  }, [user]);

  // Simulation: Update cleaning progress
  useEffect(() => {
    const interval = setInterval(() => {
      setRooms(prev => prev.map(room => {
        if (room.status === 'Cleaning' && room.cleaningProgress !== undefined) {
          const nextProgress = room.cleaningProgress + 5;
          if (nextProgress >= 100) {
            return { ...room, status: 'Available', cleaningProgress: undefined };
          }
          return { ...room, cleaningProgress: nextProgress };
        }
        return room;
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleBookRoom = async (room: Room) => {
    if (!user) return;

    try {
      await addDoc(collection(db, 'bookings'), {
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        roomId: room.id,
        roomName: room.name,
        startTime: new Date().toISOString(),
        durationMinutes: 60,
        status: 'active',
        createdAt: serverTimestamp()
      });

      setRooms(prev => prev.map(r => 
        r.id === room.id ? { ...r, status: 'Occupied', nextFreeTime: '15:30' } : r
      ));
      setIsBookingModalOpen(false);
      setSelectedRoom(null);
    } catch (error) {
      handleFirestoreError(error, 'create', 'bookings');
    }
  };

  const handleAISearch = async () => {
    if (!aiMessage.trim()) return;
    setIsAiLoading(true);
    setAiResponse(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const availableRoomsInfo = rooms
        .map(r => `${r.name} (${r.status}, kapasitas ${r.capacity} orang, fasilitas: ${r.facilities.join(', ')})`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Kamu adalah asisten Inst4Class, aplikasi reservasi ruangan kampus. Berdasarkan data berikut:
${availableRoomsInfo}

User bertanya: "${aiMessage}"
Berikan rekomendasi ruangan yang paling cocok dalam 2-3 kalimat singkat. Gunakan nada bicara yang ramah dan membantu.`,
      });

      setAiResponse(response.text || "Maaf, saya tidak bisa memproses permintaan saat ini.");
    } catch (error) {
      console.error("AI Error:", error);
      setAiResponse("Maaf, terjadi kesalahan saat menghubungi asisten AI.");
    } finally {
      setIsAiLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center bg-bg-deep text-white font-sans relative overflow-hidden">
        <div className="mesh-bg" />
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-12 h-12 border-4 border-white/10 border-t-cyan-400 rounded-full"
        />
        <p className="mt-4 text-white/40 text-xs font-bold uppercase tracking-widest">Initialising Inst4Class...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col font-sans relative overflow-hidden text-white bg-bg-deep">
        <div className="mesh-bg" />
        
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-12 relative"
          >
             <div className="absolute -inset-4 bg-cyan-400 rounded-full blur-2xl opacity-20 animate-pulse"></div>
             <div className="relative w-24 h-24 glass-card flex items-center justify-center rounded-3xl border-white/20">
               <CheckCircle2 size={48} className="text-cyan-400" />
             </div>
          </motion.div>

          <h1 className="text-4xl font-display font-black mb-4 tracking-tighter">
            Smart Room <br />
            <span className="text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">Booking.</span>
          </h1>
          <p className="text-white/40 text-sm mb-12 max-w-[280px] leading-relaxed uppercase tracking-widest font-bold text-[10px]">
            Streamline your campus meetings with AI-powered room selection.
          </p>

          <button 
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full py-4 glass-card !bg-white text-bg-deep rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-4 active:scale-95 transition-all shadow-xl shadow-cyan-500/10"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>

          <p className="mt-8 text-white/20 text-[9px] uppercase tracking-widest font-bold">
            Telkom University Surabaya • 2024
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col font-sans relative overflow-hidden text-white bg-bg-deep">
      
      {/* --- Theme Background --- */}
      <div className="mesh-bg" />

      {/* --- Header --- */}
      <header className="px-6 pt-10 pb-6 shrink-0 sticky top-0 z-10 glass-card !rounded-none !bg-white/5 border-b border-white/10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-display font-extrabold text-white flex items-center gap-2 tracking-tight">
              Inst4Class
              <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"><CheckCircle2 size={24} /></span>
            </h1>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Telkom University Surabaya</p>
          </div>
          <button 
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all border border-white/10"
            onClick={() => setActiveTab('profile')}
          >
            <User size={20} />
          </button>
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-cyan-400 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Cari ruang diskusi..." 
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:border-cyan-400 transition-all backdrop-blur-md placeholder:text-white/20"
          />
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-24 relative z-0">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-display font-bold text-lg text-white">Quick Booking</h2>
              <button className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1 hover:opacity-80 transition-opacity">
                <Filter size={14} /> Filter
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {rooms.map(room => (
                <RoomCard 
                  key={room.id} 
                  room={room} 
                  onClick={() => {
                    setSelectedRoom(room);
                    setIsBookingModalOpen(true);
                  }} 
                />
              ))}
            </div>
            
            {/* AI Banner */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-3xl p-6 relative overflow-hidden border-cyan-500/30"
            >
              <div className="absolute top-0 right-0 p-2 opacity-20 text-cyan-400">
                <Sparkles size={100} />
              </div>
              <div className="relative z-10">
                <h3 className="font-display font-bold text-lg mb-1 flex items-center gap-2">
                  Bingung Pilih Ruangan?
                  <Sparkles size={20} className="text-cyan-400" />
                </h3>
                <p className="text-white/60 text-xs mb-4 leading-relaxed">Asisten AI kami dapat membantu Anda menemukan ruangan yang paling sesuai.</p>
                <button 
                  onClick={() => setIsAIChatOpen(true)}
                  className="bg-white text-bg-deep px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-soft flex items-center gap-2 hover:opacity-90 transition-opacity"
                >
                  Tanya AI Sekarang
                  <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="font-display font-bold text-lg text-white">Riwayat Reservasi</h2>
            {bookings.length === 0 ? (
              <div className="text-center py-20 opacity-30">
                <History size={48} className="mx-auto mb-4" />
                <p className="text-sm uppercase tracking-widest font-bold">No history found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {bookings.map(booking => (
                  <div key={booking.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white leading-tight">{booking.roomName}</h4>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 mt-1 font-mono">
                        <Clock size={12} />
                        <span>{new Date(booking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {booking.durationMinutes} Min</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      booking.status === 'active' ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20' : 'text-white/20 bg-white/5 border border-white/10'
                    }`}>
                      {booking.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-8 py-4">
            <div className="text-center">
              <div className="relative inline-block">
                <div className="absolute -inset-2 bg-cyan-400 rounded-full blur opacity-20"></div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-24 h-24 rounded-full border-2 border-white/20 object-cover relative z-10" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-full mx-auto mb-4 flex items-center justify-center text-cyan-400 relative z-10">
                    <User size={48} />
                  </div>
                )}
              </div>
              <h3 className="font-display font-bold text-xl mt-4">{user.displayName || 'Mahasiswa'}</h3>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{user.email}</p>
            </div>
            
            <div className="glass-card rounded-3xl p-2">
              {[
                { icon: <User size={18} />, label: 'Account Security' },
                { icon: <Calendar size={18} />, label: 'My Calendar' },
                { icon: <Info size={18} />, label: 'Support Centre' },
              ].map((item, idx) => (
                <button key={idx} className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-2xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="text-white/40">{item.icon}</div>
                    <span className="font-medium text-white/80">{item.label}</span>
                  </div>
                  <ChevronRight size={18} className="text-white/20" />
                </button>
              ))}
              <button 
                onClick={() => signOut(auth)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-2xl transition-colors mt-2 text-rose-400 border-t border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="text-rose-400/60"><ArrowRight size={18} className="rotate-180" /></div>
                  <span className="font-black uppercase tracking-widest text-[10px]">Logout Account</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* --- Footer Nav --- */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-bg-deep/40 backdrop-blur-2xl border-t border-white/10 px-8 py-4 flex justify-between items-center z-40">
        {[
          { id: 'dashboard', icon: <LayoutDashboard size={22} />, label: 'Home' },
          { id: 'history', icon: <History size={22} />, label: 'History' },
          { id: 'profile', icon: <User size={22} />, label: 'Profile' },
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === item.id ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]' : 'text-white/40 hover:text-white/60'
            }`}
          >
            <motion.div animate={{ scale: activeTab === item.id ? 1.1 : 1 }}>
              {item.icon}
            </motion.div>
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* --- Modals Overlay --- */}
      <AnimatePresence>
        {isBookingModalOpen && selectedRoom && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBookingModalOpen(false)}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[60]" 
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto glass-card !bg-bg-deep/90 border-t border-white/20 rounded-t-[40px] z-[70] p-8 pb-10 shadow-2xl"
            >
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-8" />
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-display font-bold text-white">{selectedRoom.name}</h3>
                  <div className="flex items-center text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-2 gap-1.5 font-mono">
                    <MapPin size={14} className="text-cyan-400" />
                    <span>{selectedRoom.floor}</span>
                  </div>
                </div>
                <button onClick={() => setIsBookingModalOpen(false)} className="bg-white/10 p-2 rounded-full text-white/50 hover:text-white hover:bg-white/20 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                  <span className="block text-white/40 text-[9px] font-bold uppercase tracking-widest mb-1.5">Kapasitas</span>
                  <div className="flex items-center gap-2 text-white font-mono font-bold">
                    <Users size={16} className="text-cyan-400" />
                    <span>{selectedRoom.capacity} PAX</span>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                  <span className="block text-white/40 text-[9px] font-bold uppercase tracking-widest mb-1.5">Status</span>
                  <div className={`flex items-center gap-2 font-bold ${
                    selectedRoom.status === 'Available' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {selectedRoom.status === 'Available' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span className="text-[10px] uppercase tracking-widest font-black">{selectedRoom.status}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <h4 className="font-bold text-white/40 text-[10px] uppercase tracking-[0.2em] mb-2">Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedRoom.facilities.map((f, i) => (
                    <span key={i} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/70">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {selectedRoom.status === 'Available' ? (
                <div className="relative group">
                  <div className="absolute -inset-1 bg-cyan-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                  <button 
                    onClick={() => handleBookRoom(selectedRoom)}
                    className="relative w-full py-4 bg-cyan-400 text-bg-deep rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 active:scale-95 transition-transform"
                  >
                    Confirm Selection
                    <ArrowRight size={20} />
                  </button>
                </div>
              ) : selectedRoom.status === 'Cleaning' ? (
                <div className="flex flex-col gap-4">
                  <div className="glass-pill p-4 rounded-2xl text-white/80 text-xs flex gap-3 items-center">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_cyan]"></div>
                    <p className="font-bold tracking-wide">Cleaning in progress...</p>
                  </div>
                  <button disabled className="w-full py-4 bg-white/10 border border-white/10 text-white/30 rounded-2xl font-bold uppercase tracking-widest text-xs">
                    Pending ({selectedRoom.cleaningProgress}%)
                  </button>
                </div>
              ) : (
                <button disabled className="w-full py-4 bg-white/10 border border-white/10 text-white/30 rounded-2xl font-bold uppercase tracking-widest text-xs">
                  Next Available at {selectedRoom.nextFreeTime}
                </button>
              )}
            </motion.div>
          </>
        )}

        {isAIChatOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAIChatOpen(false)}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[80]" 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-6 max-w-md mx-auto h-[530px] glass-card !bg-bg-deep/95 border-white/20 rounded-[40px] z-[90] shadow-2xl flex flex-col overflow-hidden self-center"
            >
              <div className="bg-white/5 border-b border-white/10 p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute -inset-1 bg-cyan-400 rounded-full blur opacity-30 shadow-[0_0_15px_cyan]"></div>
                    <div className="relative w-12 h-12 bg-white/10 rounded-full flex items-center justify-center border border-white/20 text-cyan-400">
                      <Sparkles size={24} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">Inst4Class AI</h3>
                    <div className="flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                       <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Active Intelligence</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsAIChatOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors text-white/50">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {aiResponse ? (
                  <div className="bg-white/5 p-5 rounded-[24px] border border-white/10 text-white/80 text-sm leading-relaxed relative">
                    <div className="absolute -top-3 -left-3 bg-cyan-400 text-bg-deep p-1.5 rounded-xl shadow-lg">
                      <Sparkles size={14} />
                    </div>
                    {aiResponse}
                  </div>
                ) : (
                  <div className="text-center py-12 flex flex-col items-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/20 mb-6">
                      <Info size={32} />
                    </div>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-6">Discovery Engine</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['Cari ruang 10 orang', 'Meja diskusi ber-AC', 'Ruang dekat Lantai 2'].map(q => (
                        <button 
                          key={q} 
                          onClick={() => setAiMessage(q)}
                          className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-white/60 hover:border-cyan-400 hover:text-cyan-400 transition-all font-mono"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isAiLoading && (
                  <div className="flex gap-2 px-2 justify-center py-4">
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_cyan]" />
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }} className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_cyan]" />
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_cyan]" />
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3 items-center">
                <input 
                  type="text" 
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
                  placeholder="Butuh ruangan apa hari ini?" 
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-cyan-400 transition-all placeholder:text-white/20"
                />
                <button 
                  onClick={handleAISearch}
                  disabled={isAiLoading}
                  className="bg-cyan-400 text-bg-deep p-4 rounded-2xl shadow-lg shadow-cyan-500/20 active:scale-90 transition-transform disabled:opacity-50"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        ::-webkit-scrollbar {
          width: 0px;
        }
      `}</style>
    </div>
  );
}
