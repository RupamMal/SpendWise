import React, { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  Plus, 
  LogOut, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Camera, 
  PieChart, 
  History,
  Loader2,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { auth, db } from './lib/firebase';
import { UserConfig, Transaction } from './types';
import { analyzeExpenseScreenshot, generateMonthlyReport } from './services/gemini';
import { cn, formatCurrency } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showReport, setShowReport] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) {
      setUserConfig(null);
      setTransactions([]);
      return;
    }

    const configRef = doc(db, 'users', user.uid);
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserConfig(docSnap.data() as UserConfig);
        setIsNewUser(false);
      } else {
        setIsNewUser(true);
      }
    });

    const transRef = collection(db, 'users', user.uid, 'transactions');
    const q = query(transRef, orderBy('date', 'desc'));
    const unsubTrans = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });

    return () => {
      unsubConfig();
      unsubTrans();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleOnboarding = async (initialBalance: number, monthlyLimit: number) => {
    if (!user) return;
    const config: UserConfig = {
      initialBalance,
      monthlyLimit,
      currentBalance: initialBalance,
      lastResetDate: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', user.uid), config);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !userConfig) return;

    setAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const base64Data = base64.split(',')[1];
        
        try {
          const results = await analyzeExpenseScreenshot(base64Data, file.type);
          
          let totalBalanceDiff = 0;
          const userRef = doc(db, 'users', user.uid);
          const transRef = collection(db, 'users', user.uid, 'transactions');

          for (const result of results) {
            const newTransaction: Transaction = {
              amount: result.amount,
              type: result.type,
              category: result.category,
              description: result.description,
              date: new Date().toISOString()
            };

            // Update Firestore
            await addDoc(transRef, newTransaction);
            
            // Calculate total balance change
            const diff = result.type === 'credit' ? result.amount : -result.amount;
            totalBalanceDiff += diff;
          }
          
          // Update User Balance once with cumulative change
          await updateDoc(userRef, {
            currentBalance: userConfig.currentBalance + totalBalanceDiff
          });

          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: totalBalanceDiff >= 0 ? ['#22c55e', '#ffffff'] : ['#ef4444', '#ffffff']
          });

        } catch (err) {
          alert("Could not extract transaction data. Please try another screenshot.");
        } finally {
          setAnalyzing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setAnalyzing(false);
      console.error("Upload failed:", error);
    }
  };

  const handleGenerateReport = async () => {
    if (!user || transactions.length === 0 || !userConfig) return;
    setGeneratingReport(true);
    setShowReport(true);
    try {
      const reportContent = await generateMonthlyReport(transactions, userConfig.monthlyLimit, userConfig.initialBalance);
      setMonthlyReport(reportContent);
    } catch (err) {
      setMonthlyReport("Failed to generate report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zinc-900 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900 rounded-full blur-[120px]" />
        </div>
        
        <div className="relative z-10 max-w-md w-full text-center space-y-8">
          <div className="mx-auto w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-xl shadow-zinc-200 text-white font-bold p-3">
             <Wallet className="w-full h-full" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900">SpendWise AI</h1>
            <p className="text-zinc-500 text-lg">
              Master your finances with smart screenshot analysis and automated expense tracking.
            </p>
          </div>
          <button onClick={handleLogin} className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-lg cursor-pointer">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 bg-white rounded-full p-0.5" referrerPolicy="no-referrer" />
            Continue with Google
          </button>
          <p className="text-zinc-400 text-sm">
            Secure, encrypted and purely analytical. No bank access needed.
          </p>
        </div>
      </div>
    );
  }

  if (isNewUser) {
    return <Onboarding onComplete={handleOnboarding} />;
  }

  const currentMonthExpenses = transactions
    .filter(t => t.type === 'debit')
    .reduce((acc, t) => acc + t.amount, 0);

  const isOverLimit = userConfig ? currentMonthExpenses > userConfig.monthlyLimit : false;

  return (
    <div className="min-h-screen bg-zinc-50 pb-32">
      {/* Header */}
      <nav className="sticky top-0 z-30 bg-zinc-50/80 backdrop-blur-md border-b border-zinc-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
              <Wallet className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl">SpendWise</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-zinc-500 text-sm font-medium">{user.displayName}</span>
            <button onClick={handleLogout} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500 cursor-pointer">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Alerts */}
        <AnimatePresence>
          {isOverLimit && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start gap-4"
            >
              <AlertCircle className="text-red-500 w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Spending Alert</h3>
                <p className="text-red-700/80 text-sm">
                  You've exceeded your monthly spending limit of {formatCurrency(userConfig?.monthlyLimit || 0)}. 
                  Your current expenses are {formatCurrency(currentMonthExpenses)}.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Balance Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card p-8 flex flex-col justify-between overflow-hidden relative min-h-[220px]">
             <div className="absolute -top-12 -right-12 w-48 h-48 bg-zinc-900/5 rounded-full blur-3xl" />
             <div>
               <p className="text-zinc-500 font-medium mb-1 uppercase tracking-wider text-xs">Available Balance</p>
               <h2 className="text-5xl font-bold tracking-tight text-zinc-900 tabular-nums">
                 {formatCurrency(userConfig?.currentBalance || 0)}
               </h2>
             </div>
             <div className="flex items-center gap-4 mt-8">
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full text-sm font-semibold">
                  <TrendingUp className="w-4 h-4" />
                  <span>+ {formatCurrency(transactions.filter(t => t.type === 'credit').reduce((a, b) => a + b.amount, 0))}</span>
                </div>
                <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full text-sm font-semibold">
                  <TrendingDown className="w-4 h-4" />
                  <span>- {formatCurrency(currentMonthExpenses)}</span>
                </div>
             </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative overflow-hidden min-h-[220px]">
            <div>
              <p className="text-zinc-500 font-medium mb-1 uppercase tracking-wider text-xs">Monthly Limit Usage</p>
              <div className="flex items-end gap-2 mb-4">
                <h2 className="text-4xl font-bold text-zinc-900">
                  {Math.round((currentMonthExpenses / (userConfig?.monthlyLimit || 1)) * 100)}%
                </h2>
                <span className="text-zinc-400 pb-1 font-medium italic text-xs leading-none">spent</span>
              </div>
              <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                <motion.div 
                  className={cn("h-full transition-all", isOverLimit ? "bg-rose-500" : "bg-zinc-900")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((currentMonthExpenses / (userConfig?.monthlyLimit || 1)) * 100, 100)}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
            <p className="text-zinc-500 text-sm mt-4">
              {formatCurrency(currentMonthExpenses)} of {formatCurrency(userConfig?.monthlyLimit || 0)}
            </p>
          </div>
        </div>

        {/* Charts & Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 glass-card p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xl flex items-center gap-2 font-sans">
                  <PieChart className="w-5 h-5 text-zinc-400" /> Spending by Category
                </h3>
              </div>
              <div className="h-[300px] w-full">
                <SpendingChart transactions={transactions} />
              </div>
           </div>

           <div className="glass-card p-8 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-100">
                <FileText className="text-zinc-400 w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-xl">Monthly Insights</h3>
                <p className="text-zinc-500 text-sm">
                  Generate an AI-powered detailed report of your spending patterns.
                </p>
              </div>
              <button 
                onClick={handleGenerateReport}
                disabled={transactions.length === 0}
                className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {generatingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Generate Report
              </button>
           </div>
        </div>

        {/* Transactions List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-2xl flex items-center gap-3">
              <History className="w-6 h-6 text-zinc-400" /> Recent Activity
            </h3>
          </div>
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 border-2 border-dashed border-zinc-100 rounded-3xl">
                No transactions yet. Spread some cash and upload your captures!
              </div>
            ) : (
              transactions.map((t, i) => (
                <TransactionRow key={t.id || i} transaction={t} />
              ))
            )}
          </div>
        </div>
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
        <div className="bg-zinc-900 border border-white/10 p-2 rounded-full shadow-2xl flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*"
            capture="environment"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="bg-white text-zinc-900 h-14 pr-6 pl-4 rounded-full flex items-center gap-3 font-bold active:scale-95 transition-all disabled:opacity-50 cursor-pointer shadow-lg"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Analyzing Receipt...</span>
              </>
            ) : (
              <>
                <div className="w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center text-white">
                  <Camera className="w-5 h-5" />
                </div>
                <span>Snapshot Receipt</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {showReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowReport(false)}
               className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            >
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between shrink-0">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <FileText className="w-6 h-6" />
                  </div>
                  Monthly Smart Report
                </h2>
                <button onClick={() => setShowReport(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto max-w-none">
                {generatingReport ? (
                   <div className="flex flex-col items-center justify-center py-12 gap-4">
                     <Loader2 className="w-10 h-10 animate-spin text-zinc-200" />
                     <p className="text-zinc-500 italic">AI is carefully reviewing your finances...</p>
                   </div>
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed text-zinc-600 font-sans text-base">
                    {monthlyReport}
                  </div>
                )}
              </div>
              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end shrink-0">
                <button onClick={() => setShowReport(false)} className="btn-primary cursor-pointer">Got it</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Onboarding({ onComplete }: { onComplete: (initial: number, limit: number) => void }) {
  const [initial, setInitial] = useState("");
  const [limit, setLimit] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!initial || !limit) return;
    onComplete(Number(initial), Number(limit));
  };

  return (
    <div className="min-h-screen grid place-items-center bg-zinc-50 p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card p-10 space-y-8"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Setup Dashboard</h2>
          <p className="text-zinc-500">Configure your starting point to begin tracking.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Initial Bank Balance (INR)</label>
            <input 
              type="number" 
              value={initial} 
              onChange={(e) => setInitial(e.target.value)}
              placeholder="e.g. 50000"
              className="w-full bg-zinc-100/50 border border-zinc-200 p-4 rounded-2xl outline-none focus:ring-2 ring-zinc-900/5 transition-all text-lg font-medium"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Monthly Expense Limit (INR)</label>
            <input 
              type="number" 
              value={limit} 
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 15000"
              className="w-full bg-zinc-100/50 border border-zinc-200 p-4 rounded-2xl outline-none focus:ring-2 ring-zinc-900/5 transition-all text-lg font-medium"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full py-4 text-lg cursor-pointer">Start Tracking</button>
        </form>
      </motion.div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isCredit = transaction.type === 'credit';
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-card p-5 flex items-center justify-between group hover:border-zinc-300/50 transition-all cursor-default"
    >
      <div className="flex items-center gap-4 overflow-hidden">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
          isCredit ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {isCredit ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
        </div>
        <div className="overflow-hidden">
          <h4 className="font-bold text-zinc-900 truncate">{transaction.description}</h4>
          <div className="flex items-center gap-2 text-zinc-400 text-sm mt-0.5 whitespace-nowrap">
            <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
              {transaction.category}
            </span>
            <span>•</span>
            <span>{new Date(transaction.date).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-4">
        <p className={cn("font-bold text-lg tabular-nums", isCredit ? "text-emerald-600" : "text-zinc-900")}>
          {isCredit ? '+' : '-'} {formatCurrency(transaction.amount)}
        </p>
      </div>
    </motion.div>
  );
}

function SpendingChart({ transactions }: { transactions: Transaction[] }) {
  const data = transactions
    .filter(t => t.type === 'debit')
    .reduce((acc: any[], t) => {
      const existing = acc.find(item => item.name === t.category);
      if (existing) {
        existing.value += t.amount;
      } else {
        acc.push({ name: t.category, value: t.amount });
      }
      return acc;
    }, [])
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
        <XAxis type="number" hide />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={90} 
          axisLine={false} 
          tickLine={false}
          tick={{ fontSize: 12, fill: '#71717a', fontWeight: 500 }}
        />
        <Tooltip 
          cursor={{ fill: 'rgba(244, 244, 245, 0.5)' }}
          contentStyle={{ 
            borderRadius: '16px', 
            border: 'none', 
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            padding: '12px'
          }}
          formatter={(value: number) => [formatCurrency(value), 'Spent']}
        />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={24}>
           {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={index === 0 ? '#18181b' : '#a1a1aa'} />
           ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
