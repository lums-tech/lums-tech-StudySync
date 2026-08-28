/**
 * PLANNERAPP - Live Real-Time Clock, Service Worker Background Alarms & Firestore Sync
 */

// REGISTER SERVICE WORKER FOR BACKGROUND ALARMS & PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            console.log('PlannerApp PWA Service Worker Registered!', reg);
        }).catch((err) => {
            console.error('Service Worker registration failed:', err);
        });
    });
}

const firebaseConfig = {
    apiKey: "AIzaSyAcvHEqaxAD3Je-C33niile2IWNqla1sbM",
    authDomain: "plannerapp-301d2.firebaseapp.com",
    projectId: "plannerapp-301d2",
    storageBucket: "plannerapp-301d2.firebasestorage.app",
    messagingSenderId: "880820053511",
    appId: "1:880820053511:web:ae561f04ad1961c34daca2",
    measurementId: "G-13SW1L3L5B"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const firestore = firebase.firestore();

let sessionStr = sessionStorage.getItem('plannerSession');
let currentUser = sessionStr ? JSON.parse(sessionStr) : null;
let isViewer = currentUser?.role === 'VIEWER';

let currentCalendarDate = new Date();
let triggeredAlarms = new Set(); 
let audioCtx = null;

// UNLOCK AUDIO CONTEXT ON USER INTERACTION
window.addEventListener('click', initAudioEngine, { once: true });
window.addEventListener('keydown', initAudioEngine, { once: true });

function initAudioEngine() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }
    }
}

window.onload = async () => {
    startLiveClockAndAlarms(); 

    if (document.getElementById('page-login') || document.getElementById('page-register')) {
        if (currentUser) routeUser(currentUser);
        if (document.getElementById('page-register')) initRegister();
        if (document.getElementById('page-login')) initLogin();
    } else if (document.getElementById('page-app')) {
        if (!currentUser || currentUser.role === 'ADMIN') {
            window.location.href = 'login.html';
        } else {
            if (!isViewer) {
                try {
                    const doc = await firestore.collection('users').doc(currentUser.id).get();
                    if(doc.exists) {
                        currentUser = doc.data();
                        sessionStorage.setItem('plannerSession', JSON.stringify(currentUser));
                    }
                } catch(e) {
                    console.error("Error fetching fresh user data:", e);
                }
            }
            initApp();
        }
    } else if (document.getElementById('page-admin')) {
        if (!currentUser || currentUser.role !== 'ADMIN') window.location.href = 'login.html';
        else initAdmin();
    }
};

// REAL LIVE TIME CLOCK & ALARM ENGINE
function startLiveClockAndAlarms() {
    function updateClockAndCheckAlarms() {
        const timeEl = document.getElementById('live-time');
        const dateEl = document.getElementById('live-date');
        const now = new Date();

        if (timeEl && dateEl) {
            timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            dateEl.innerText = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        }

        if (currentUser && document.getElementById('page-app')) {
            checkAllAlarms(now);
        }
    }

    updateClockAndCheckAlarms();
    setInterval(updateClockAndCheckAlarms, 1000);
}

// ALARM CHECKER ENGINE (SCHEDULES, TASKS, EXAMS)
function checkAllAlarms(now) {
    const todayStr = now.toISOString().split('T')[0]; 
    const todayDayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentHHMM = `${hours}:${minutes}`;

    // 1. CHECK CLASS SCHEDULES
    (currentUser.schedules || []).forEach(s => {
        if (s.day === todayDayName && s.start === currentHHMM) {
            triggerAlarmKey(`sched_${s.id}_${todayStr}_${currentHHMM}`, `🕒 CLASS TIME!`, `Oras na para sa klase mo sa ${getSubName(s.subId)} sa Room ${s.room}!`);
        }
    });

    // 2. CHECK TASKS DEADLINE
    (currentUser.tasks || []).forEach(t => {
        if (t.status !== 'Completed' && t.date === todayStr && t.time === currentHHMM) {
            triggerAlarmKey(`task_${t.id}_${todayStr}_${currentHHMM}`, `✅ TASK DEADLINE!`, `Deadline na ng Task: "${t.title}"!`);
        }
    });

    // 3. CHECK EXAMS SCHEDULE
    (currentUser.exams || []).forEach(e => {
        if (e.date === todayStr && e.time === currentHHMM) {
            triggerAlarmKey(`exam_${e.id}_${todayStr}_${currentHHMM}`, `📝 EXAM ALERT!`, `Magsisimula na ang exam mo sa: "${e.name}"!`);
        }
    });
}

function triggerAlarmKey(alarmKey, title, message) {
    if (triggeredAlarms.has(alarmKey)) return;

    // KAGAD TITIGIL KAPAG OFF ANG NOTIFICATION SETTING
    if (currentUser?.settings?.notificationsEnabled === false) return;

    triggeredAlarms.add(alarmKey);
    playAlarmSound();

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: message, icon: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png' });
    }

    setTimeout(() => {
        alert(`${title}\n\n${message}`);
    }, 100);
}

function playAlarmSound() {
    try {
        if (!audioCtx) initAudioEngine();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (!audioCtx) return;

        [0, 0.3, 0.6, 0.9].forEach(delay => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880; 
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.25);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(audioCtx.currentTime + delay);
            osc.stop(audioCtx.currentTime + delay + 0.25);
        });
    } catch (e) {
        console.error("Audio Alarm Error:", e);
    }
}

// DYNAMIC NOTIFICATION TOGGLE ENGINE
function toggleNotificationSetting() {
    if (!currentUser.settings) currentUser.settings = {};
    
    const currentStatus = currentUser.settings.notificationsEnabled ?? false;
    
    if (!currentStatus) {
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notifications.");
            return;
        }
        
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                currentUser.settings.notificationsEnabled = true;
                saveUserData();
                updateNotifButtonUI();
                new Notification("PlannerApp Alerts Enabled! 🚀", { body: "Makatanggap ka na ng tunog at paalala para sa mga deadlines!" });
            } else {
                alert("Notification permission was denied in browser settings.");
            }
        });
    } else {
        currentUser.settings.notificationsEnabled = false;
        saveUserData();
        updateNotifButtonUI();
        alert("Notifications & Alarms are now Disabled.");
    }
}

function updateNotifButtonUI() {
    const btn = document.getElementById('notif-toggle-btn');
    if (!btn) return;
    
    const isEnabled = currentUser?.settings?.notificationsEnabled ?? false;
    
    if (isEnabled) {
        btn.innerText = "Disable Alerts";
        btn.className = "btn btn-danger";
    } else {
        btn.innerText = "Enable Alerts";
        btn.className = "btn btn-primary";
    }
}

function routeUser(user) {
    if (user.role === 'ADMIN') window.location.href = 'admin.html';
    else window.location.href = 'index.html';
}

function logout() {
    auth.signOut().then(() => {
        sessionStorage.removeItem('plannerSession');
        window.location.href = 'login.html';
    });
}

function togglePass(id) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
}

async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const res = await auth.signInWithPopup(provider);
        const user = res.user;
        const userDocRef = firestore.collection('users').doc(user.uid);
        const doc = await userDocRef.get();

        let userData;
        if (!doc.exists) {
            userData = {
                id: user.uid,
                role: 'STUDENT',
                email: user.email,
                username: user.email.split('@')[0],
                profile: {
                    fullName: user.displayName || 'Google Student',
                    nickname: user.displayName ? user.displayName.split(' ')[0] : 'Student',
                    course: 'BS IT',
                    year: '1st Year',
                    section: 'A',
                    bio: 'Planning my success! 🚀',
                    avatarUrl: user.photoURL || ''
                },
                tasks: [], schedules: [], exams: [], subjects: [],
                settings: { theme: 'light', notificationsEnabled: false }
            };
            await userDocRef.set(userData);
        } else {
            userData = doc.data();
        }

        sessionStorage.setItem('plannerSession', JSON.stringify(userData));
        routeUser(userData);
    } catch (err) {
        console.error("Google Login Error:", err);
        const errEl = document.getElementById('login-error');
        if (errEl) errEl.innerText = "Google Sign-In failed: " + err.message;
    }
}

function initRegister() {
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email').value.toLowerCase();
        const pass = document.getElementById('reg-pass').value;
        if(pass !== document.getElementById('reg-pass2').value) {
            document.getElementById('reg-error').innerText = "Passwords don't match!"; return;
        }

        try {
            const res = await auth.createUserWithEmailAndPassword(email, pass);
            const user = res.user;
            const newUser = {
                id: user.uid, role: 'STUDENT', email, username: document.getElementById('reg-user').value.toLowerCase(),
                profile: { fullName: document.getElementById('reg-name').value, nickname: document.getElementById('reg-nick').value, course: document.getElementById('reg-course').value, year: document.getElementById('reg-year').value, section: document.getElementById('reg-section').value, bio: document.getElementById('reg-bio').value, avatarUrl: '' },
                tasks: [], schedules: [], exams: [], subjects: [], settings: { theme: 'light', notificationsEnabled: false }
            };
            await firestore.collection('users').doc(user.uid).set(newUser);
            alert("Account created successfully!"); window.location.href = 'login.html';
        } catch(err) {
            document.getElementById('reg-error').innerText = err.message;
        }
    });
}

function initLogin() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const ident = document.getElementById('login-id').value.toLowerCase();
        const pass = document.getElementById('login-pass').value;

        try {
            let emailToLogin = ident;
            if(!ident.includes('@')) {
                const q = await firestore.collection('users').where('username', '==', ident).get();
                if(!q.empty) emailToLogin = q.docs[0].data().email;
            }

            const res = await auth.signInWithEmailAndPassword(emailToLogin, pass);
            const doc = await firestore.collection('users').doc(res.user.uid).get();
            if(doc.exists) {
                sessionStorage.setItem('plannerSession', JSON.stringify(doc.data()));
                routeUser(doc.data());
            }
        } catch(err) {
            document.getElementById('login-error').innerText = "Invalid credentials or user not found.";
        }
    });
}

function initApp() {
    if(isViewer) { document.body.classList.add('viewer-mode'); document.getElementById('viewer-banner').style.display = 'block'; }
    
    applyTheme(); 
    updateProfileUI(); 
    updateDropdowns(); 
    renderAll(); 
    buildNotificationDropdown();
    updateNotifButtonUI();
    
    bindForm('form-task', saveTask);
    bindForm('form-sched', saveSchedule);
    bindForm('form-sub', saveSubject);
    bindForm('form-exam', saveExam);
    bindForm('form-prof', saveProfile);
}

async function saveUserData() {
    sessionStorage.setItem('plannerSession', JSON.stringify(currentUser));
    if(isViewer) return;
    try {
        await firestore.collection('users').doc(currentUser.id).set(currentUser, { merge: true });
    } catch(err) {
        console.error("Failed to sync data with Firestore:", err);
    }
}

function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function updateProfileUI() {
    const p = currentUser.profile || {};
    if(!p.avatarUrl) p.avatarUrl = '';

    document.getElementById('sb-nickname').innerText = p.nickname || 'User';
    document.getElementById('sb-username').innerText = '@'+(currentUser.username || 'username');
    
    const sbAvatar = document.getElementById('sb-avatar');
    const hdrAvatar = document.getElementById('hdr-avatar');
    const profAvatar = document.getElementById('prof-avatar-img');

    const avatarInitial = (p.nickname || 'U')[0].toUpperCase();

    if(p.avatarUrl && p.avatarUrl.trim() !== '') {
        [sbAvatar, hdrAvatar, profAvatar].forEach(el => {
            if(el) { el.style.backgroundImage = `url('${p.avatarUrl}')`; el.innerText = ''; }
        });
    } else {
        [sbAvatar, hdrAvatar, profAvatar].forEach(el => {
            if(el) { el.style.backgroundImage = 'none'; el.innerText = avatarInitial; }
        });
    }

    const greetingText = `${getTimeBasedGreeting()}, ${p.nickname || 'User'}! 👋`;
    document.getElementById('header-greeting').innerText = greetingText;
    
    document.getElementById('prof-nick').innerText = p.nickname || '';
    document.getElementById('prof-user').innerText = '@'+(currentUser.username || '');
    document.getElementById('prof-name').innerText = p.fullName || currentUser.email || '';
    document.getElementById('prof-course').innerText = p.course || '-';
    document.getElementById('prof-year').innerText = p.year || '-';
    document.getElementById('prof-sec').innerText = p.section || '-';
    document.getElementById('prof-bio').innerText = p.bio || 'No bio yet.';
    
    document.getElementById('p-fullname').value = p.fullName || currentUser.email || '';
    document.getElementById('p-nick').value = p.nickname || '';
    document.getElementById('p-course').value = p.course || '';
    document.getElementById('p-year').value = p.year || '';
    document.getElementById('p-section').value = p.section || '';
    document.getElementById('p-bio').value = p.bio || '';
}

function renderAll() { 
    renderDashboard(); 
    renderTasks(); 
    renderSchedule(); 
    renderGrid('exams', 'exams-grid'); 
    renderGrid('subjects', 'subs-grid'); 
    renderCalendar();
    buildNotificationDropdown();
}

function calculateProductivity() {
    const tasks = currentUser.tasks || [];
    const exams = currentUser.exams || [];
    
    if (tasks.length === 0 && exams.length === 0) return 0;

    const weights = { "Low": 5, "Medium": 10, "High": 20 };
    
    let totalPossiblePoints = 0;
    let pendingPoints = 0;

    tasks.forEach(t => {
        let pts = weights[t.priority] || 10;
        totalPossiblePoints += pts;
        if (t.status !== 'Completed') pendingPoints += pts;
    });

    exams.forEach(e => {
        let pts = weights[e.priority] || 15;
        totalPossiblePoints += pts;
        pendingPoints += pts;
    });

    if (totalPossiblePoints === 0) return 0;

    let pendingPercentage = Math.round((pendingPoints / totalPossiblePoints) * 100);
    return Math.min(100, Math.max(0, pendingPercentage));
}

function renderDashboard() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    
    const sT = (currentUser.schedules || []).filter(s => s.day === todayName);
    const pT = (currentUser.tasks || []).filter(t => t.status !== 'Completed');
    
    document.getElementById('dash-classes').innerText = sT.length;
    document.getElementById('dash-pending').innerText = pT.length;
    document.getElementById('dash-exams').innerText = (currentUser.exams || []).filter(e => e.date >= todayStr).length;
    
    const pendingLoad = calculateProductivity();
    const progressFill = document.getElementById('dash-progress');
    const progressText = document.getElementById('dash-prog-text');
    
    if (progressFill) progressFill.style.width = pendingLoad + '%';
    if (progressText) progressText.innerText = `${pendingLoad}% Pending Load`;

    document.getElementById('dash-sched-list').innerHTML = sT.length ? sT.sort((a,b)=>a.start.localeCompare(b.start)).map(s => `<li><div><strong>${getSubName(s.subId)}</strong><br><small class="text-light">${s.start} - ${s.end} | ${s.room}</small></div></li>`).join('') : '<div class="text-light p-10">No classes today. Enjoy your day! ☕</div>';
    document.getElementById('dash-task-list').innerHTML = pT.length ? pT.slice(0,4).map(t => `<li><div><strong>${t.title}</strong><br><small class="text-light">Due: ${t.date} ${t.time || ''}</small></div><span class="badge ${t.priority==='High'?'bg-danger':t.priority==='Medium'?'bg-warning':'bg-primary'}">${t.priority}</span></li>`).join('') : '<div class="text-light p-10">All caught up! 🎉</div>';
}

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let cellsHtml = '';
    for (let i = 0; i < firstDayIndex; i++) {
        cellsHtml += `<div class="cal-cell empty"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dayStr === todayStr;

        const tasksOnDay = (currentUser.tasks || []).filter(t => t.date === dayStr);
        const examsOnDay = (currentUser.exams || []).filter(e => e.date === dayStr);

        let badges = '';
        tasksOnDay.forEach(t => {
            const isDone = t.status === 'Completed';
            badges += `<span class="cal-badge ${isDone?'bg-success':'bg-primary'}" title="Task: ${t.title}">✔ ${t.title}</span>`;
        });
        examsOnDay.forEach(e => {
            badges += `<span class="cal-badge bg-danger" title="Exam: ${e.name}">📝 ${e.name}</span>`;
        });

        cellsHtml += `<div class="cal-cell ${isToday ? 'today' : ''}">
            <span class="day-num">${day}</span>
            <div class="cal-events">${badges}</div>
        </div>`;
    }

    document.getElementById('calendar-days').innerHTML = cellsHtml;
}

function changeMonth(dir) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    renderCalendar();
}

function toggleNotifDropdown() {
    const box = document.getElementById('notif-dropdown');
    box.classList.toggle('active');
}

function buildNotificationDropdown() {
    const listEl = document.getElementById('notif-content-list');
    const dotEl = document.getElementById('notif-badge');
    
    const tasks = currentUser.tasks || [];
    const schedules = currentUser.schedules || [];
    const exams = currentUser.exams || [];
    const subjects = currentUser.subjects || [];

    let html = '';

    if(subjects.length > 0) {
        html += `<div class="mb-5"><strong>📚 Subjects (${subjects.length})</strong></div>`;
        subjects.forEach(s => {
            html += `<div class="notif-item"><strong>${s.name}</strong></div>`;
        });
    }

    if(schedules.length > 0) {
        html += `<div class="mt-10 mb-5"><strong>🕒 Schedules (${schedules.length})</strong></div>`;
        schedules.forEach(s => {
            html += `<div class="notif-item"><strong>${getSubName(s.subId)}</strong> - ${s.day} (${s.start} - ${s.end})</div>`;
        });
    }

    if(exams.length > 0) {
        html += `<div class="mt-10 mb-5"><strong>📝 Exams (${exams.length})</strong></div>`;
        exams.forEach(e => {
            html += `<div class="notif-item" style="border-left-color:var(--danger)"><strong>${e.name}</strong> | Date: ${e.date} ${e.time || ''} (${e.priority})</div>`;
        });
    }

    if(tasks.length > 0) {
        html += `<div class="mt-10 mb-5"><strong>✅ Tasks & History (${tasks.length})</strong></div>`;
        tasks.forEach(t => {
            const isDone = t.status === 'Completed';
            html += `<div class="notif-item" style="border-left-color:${isDone?'var(--success)':'var(--primary)'}; opacity:${isDone?0.7:1}">
                <strong style="${isDone?'text-decoration:line-through':''}">${t.title}</strong><br>
                <small>Due: ${t.date} ${t.time || ''} | Status: <b>${t.status}</b> (${t.priority})</small>
            </div>`;
        });
    }

    if(subjects.length === 0 && schedules.length === 0 && exams.length === 0 && tasks.length === 0) {
        html = `<p class="text-light text-center">No history or records found yet.</p>`;
        dotEl.style.display = 'none';
    } else {
        dotEl.style.display = 'block';
    }

    listEl.innerHTML = html;
}

function saveTask(e) {
    const id = document.getElementById('t-id').value || 't_'+Date.now();
    const task = { 
        id, 
        title: document.getElementById('t-title').value, 
        subId: document.getElementById('t-sub').value, 
        date: document.getElementById('t-date').value, 
        time: document.getElementById('t-time')?.value || '00:00',
        priority: document.getElementById('t-pri').value, 
        status: 'Pending' 
    };
    upsertArray('tasks', task);
}

function renderTasks() {
    const filter = document.getElementById('task-filter').value;
    let list = currentUser.tasks || [];
    if(filter !== 'All') list = list.filter(t => t.status === filter);
    document.getElementById('tasks-list').innerHTML = list.length ? list.map(t => `<li>
        <div style="${t.status==='Completed'?'opacity:0.5;text-decoration:line-through':''}"><strong class="mr-10">${t.title}</strong><span class="badge ${t.priority==='High'?'bg-danger':t.priority==='Medium'?'bg-warning':'bg-primary'}">${t.priority}</span><br><small class="text-light">${getSubName(t.subId)} | Due: ${t.date} ${t.time ? 'at ' + t.time : ''}</small></div>
        <div class="flex gap-10 edit-only"><button class="btn btn-icon text-success" onclick="toggleTask('${t.id}')">✔</button><button class="btn btn-icon text-danger" onclick="delItem('tasks','${t.id}')">✖</button></div>
    </li>`).join('') : '<div class="text-light text-center p-20">No tasks here yet. Click "+ Add Task" to start!</div>';
}

function toggleTask(id) { 
    const t = (currentUser.tasks || []).find(x=>x.id===id); 
    if(t) {
        t.status = t.status === 'Pending' ? 'Completed' : 'Pending'; 
        saveUserData(); 
        renderTasks(); 
        renderDashboard(); 
        renderCalendar(); 
        buildNotificationDropdown();
    }
}

function saveSchedule(e) {
    const start = document.getElementById('s-start').value, end = document.getElementById('s-end').value, day = document.getElementById('s-day').value;
    if(start >= end) { alert("End time must be after start time."); return; }
    const id = document.getElementById('s-id').value;
    upsertArray('schedules', { id: id||'s_'+Date.now(), subId: document.getElementById('s-sub').value, day, start, end, room: document.getElementById('s-room').value });
}

function renderSchedule() {
    const days = {"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,"Friday":5,"Saturday":6};
    const sorted = [...(currentUser.schedules || [])].sort((a,b) => days[a.day] - days[b.day] || a.start.localeCompare(b.start));
    document.getElementById('sched-table').innerHTML = sorted.length ? sorted.map(s => `<tr><td><strong>${getSubName(s.subId)}</strong></td><td>${s.day}</td><td>${s.start} - ${s.end}</td><td>${s.room}</td><td class="edit-only"><button class="btn btn-icon text-danger" onclick="delItem('schedules','${s.id}')">✖</button></td></tr>`).join('') : '<tr><td colspan="5" class="text-center text-light p-20">Your timetable is empty.</td></tr>';
}

function saveSubject(e) { 
    upsertArray('subjects', { id: document.getElementById('sub-id').value||'sub_'+Date.now(), name: document.getElementById('sub-name').value, code: document.getElementById('sub-code').value, teacher: document.getElementById('sub-teacher').value }); 
    updateDropdowns(); 
}

function saveExam(e) { 
    upsertArray('exams', { 
        id: document.getElementById('e-id').value||'e_'+Date.now(), 
        name: document.getElementById('e-name').value, 
        subId: document.getElementById('e-sub').value, 
        date: document.getElementById('e-date').value, 
        time: document.getElementById('e-time')?.value || '00:00',
        priority: document.getElementById('e-pri').value 
    }); 
}

function saveProfile(e) { 
    if(!currentUser.profile) currentUser.profile = {};
    currentUser.profile.nickname = document.getElementById('p-nick').value; 
    currentUser.profile.course = document.getElementById('p-course').value; 
    currentUser.profile.year = document.getElementById('p-year').value; 
    currentUser.profile.section = document.getElementById('p-section').value; 
    currentUser.profile.bio = document.getElementById('p-bio').value; 

    const fileInput = document.getElementById('p-avatar-file');
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (uploadEvent) {
            const img = new Image();
            img.src = uploadEvent.target.result;
            img.onload = async function() {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 180;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                } else {
                    if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                currentUser.profile.avatarUrl = canvas.toDataURL('image/jpeg', 0.8);
                await saveUserData();
                updateProfileUI();
                closeModal('modal-profile');
            };
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        saveUserData().then(() => {
            updateProfileUI(); 
            closeModal('modal-profile');
        });
    }
}

function bindForm(id, handler) { document.getElementById(id).addEventListener('submit', (e) => { e.preventDefault(); handler(e); }); }

function upsertArray(arrName, obj) { 
    if(!currentUser[arrName]) currentUser[arrName] = [];
    const idx = currentUser[arrName].findIndex(x => x.id === obj.id);
    if(idx > -1) currentUser[arrName][idx] = obj; else currentUser[arrName].push(obj);
    
    saveUserData(); 
    renderAll(); 
    Array.from(document.querySelectorAll('.modal')).forEach(m => m.classList.remove('active'));
    document.getElementById('fab-menu')?.classList.remove('active');
}

function delItem(arrName, id) { 
    if(confirm('Delete this item?')) { 
        currentUser[arrName] = (currentUser[arrName] || []).filter(x => x.id !== id); 
        saveUserData(); 
        renderAll(); 
    } 
}

function getSubName(id) { const s = (currentUser.subjects || []).find(x=>x.id===id); return s ? s.name : 'Subject'; }

function renderGrid(arrName, gridId) { 
    document.getElementById(gridId).innerHTML = (currentUser[arrName] || []).length ? (currentUser[arrName] || []).map(item => {
        let badgeHtml = item.priority ? `<span class="badge ${item.priority==='High'?'bg-danger':item.priority==='Medium'?'bg-warning':'bg-primary'} ml-10">${item.priority}</span>` : '';
        let timeStr = item.time ? ` at ${item.time}` : '';
        return `<div class="card"><strong>${item.name || item.title}</strong><p class="text-light text-sm mt-10">${item.date || item.code || ''}${timeStr} ${badgeHtml}</p><button class="btn btn-icon text-danger mt-10 edit-only" onclick="delItem('${arrName}','${item.id}')">✖</button></div>`;
    }).join('') : '<div class="text-light p-20 text-center">No items found.</div>'; 
}

function updateDropdowns() { 
    const opts = (currentUser.subjects || []).map(s => `<option value="${s.id}">${s.name}</option>`).join(''); 
    document.querySelectorAll('.sub-dropdown').forEach(d => d.innerHTML = opts); 
}

function switchTab(id) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-menu li').forEach(l => l.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const navItem = Array.from(document.querySelectorAll('.nav-menu li')).find(li => li.getAttribute('onclick').includes(id));
    if(navItem) navItem.classList.add('active');
    document.getElementById('page-title').innerText = id.charAt(0).toUpperCase() + id.slice(1);
    document.getElementById('fab-menu')?.classList.remove('active');
}

function openModal(id) { 
    document.getElementById(id).classList.add('active'); 
    if(id !== 'modal-profile') {
        document.querySelector(`#${id} form`)?.reset(); 
        document.querySelector(`#${id} form input[type="hidden"]`).value=''; 
    }
    document.getElementById('fab-menu')?.classList.remove('active');
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function toggleFabMenu() { document.getElementById('fab-menu').classList.toggle('active'); }
function toggleTheme() { currentUser.settings.theme = currentUser.settings.theme === 'light' ? 'dark' : 'light'; saveUserData(); applyTheme(); }
function applyTheme() { if(currentUser.settings.theme === 'dark') document.body.setAttribute('data-theme', 'dark'); else document.body.removeAttribute('data-theme'); }
function globalSearch() { 
    const q = document.getElementById('search-bar').value.toLowerCase(); 
    if(!q) { renderTasks(); return; }
    document.getElementById('tasks-list').innerHTML = (currentUser.tasks || []).filter(t=>t.title.toLowerCase().includes(q)).map(t=>`<li><strong>${t.title}</strong></li>`).join(''); 
}
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentUser));
    const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", "planner_backup.json"); dl.click();
}
function importData(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) { 
        try { 
            Object.assign(currentUser, JSON.parse(e.target.result)); 
            await saveUserData(); 
            alert("Imported!"); 
            location.reload(); 
        } catch(err) { 
            alert("Invalid file."); 
        } 
    };
    reader.readAsText(file);
}

// --- ADMIN PANEL FUNCTIONS ---
async function initAdmin() {
    renderAdminDash(); renderAdminUsers(); renderAdminViewers();
}
function adminTab(id) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-menu li').forEach(l => l.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    event.currentTarget.classList.add('active');
}
async function renderAdminDash() {
    const snap = await firestore.collection('users').get();
    const users = snap.docs.map(d => d.data());
    document.getElementById('stat-tot-users').innerText = users.length;
    document.getElementById('stat-students').innerText = users.filter(u=>u.role==='STUDENT').length;
    document.getElementById('stat-tasks').innerText = users.reduce((acc, u) => acc + (u.tasks?.length||0), 0);
}
async function renderAdminUsers() {
    const snap = await firestore.collection('users').get();
    document.getElementById('admin-user-table').innerHTML = snap.docs.map(doc => {
        const u = doc.data();
        if(u.role === 'ADMIN') return '';
        return `<tr><td>@${u.username}</td><td>${u.profile?.fullName || ''}</td><td>${u.email}</td>
        <td><span class="badge ${u.status==='disabled'?'bg-danger':'bg-success'}">${u.status||'Active'}</span></td>
        <td><button class="btn btn-outline" onclick="toggleUserStatus('${u.id}', '${u.status}')">${u.status==='disabled'?'Enable':'Disable'}</button></td></tr>`;
    }).join('');
}
async function toggleUserStatus(id, currentStatus) {
    const newStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
    await firestore.collection('users').doc(id).update({ status: newStatus });
    renderAdminUsers();
}
async function addViewer() {
    const email = document.getElementById('new-viewer-email').value.toLowerCase();
    if(!email) return;
    await firestore.collection('settings').doc('viewers').set({ emails: firebase.firestore.FieldValue.arrayUnion(email) }, { merge: true });
    document.getElementById('new-viewer-email').value = '';
    renderAdminViewers();
}
async function renderAdminViewers() {
    const doc = await firestore.collection('settings').doc('viewers').get();
    const viewers = doc.exists ? (doc.data().emails || []) : [];
    document.getElementById('admin-viewer-list').innerHTML = viewers.map(v => `<li>${v} <button class="btn btn-icon text-danger" onclick="removeViewer('${v}')">✖</button></li>`).join('');
}
async function removeViewer(email) {
    await firestore.collection('settings').doc('viewers').update({ emails: firebase.firestore.FieldValue.arrayRemove(email) });
    renderAdminViewers();
}