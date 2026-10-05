// ============================================================
// PD CHAT - Firebase messenger
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    deleteField,
    serverTimestamp,
    writeBatch,
    increment,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCdpSt-aRVHF0Q6v4Sl6eHUWHscqNQXVgs",
    authDomain: "pd-chat-25873.firebaseapp.com",
    projectId: "pd-chat-25873",
    storageBucket: "pd-chat-25873.firebasestorage.app",
    messagingSenderId: "936535771691",
    appId: "1:936535771691:web:8de7115a5fa6a13549b86e",
    measurementId: "G-5SE3E6LFVL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Super admins always have admin rights and can never be demoted or removed.
const SUPER_ADMIN_EMAILS = [
    "pradeepgcrathod655@gmail.com",
    "patil.kaustubh.school@gmail.com"
];
const THEME_KEY = "pdchat-theme";
const NOTIFY_KEY = "pdchat-notify";
const MAX_EMBED_BYTES = 700000;
const WALLPAPER_KEY = "pdchat-wallpaper";
const SEEN_STORIES_KEY = "pdchat-seen-stories";
const STORY_TTL = 24 * 60 * 60 * 1000;
const MAX_STORIES = 5;
// A person counts as online only if their app pinged recently, so a closed
// tab that never said "offline" does not stay online forever.
const ONLINE_WINDOW = 3 * 60 * 1000;

let currentUser = null;
let currentProfile = null;
let selectedUser = null;
let selectedGroup = null;
let sidebarTab = "people";

let allUsers = [];
let allGroups = [];

let unsubscribeMe = null;
let unsubscribeUsers = null;
let unsubscribeGroups = null;
let unsubscribeMessages = null;
let unsubscribeTyping = null;
let unsubscribeCalls = null;
let unsubscribeInbox = null;
let extraUnsubs = [];
const watchedCallChats = new Set();

// chatMeta: information about each direct chat, keyed by the OTHER user's uid.
// It is filled by listenInbox() from the chats/{chatId} documents.
// Example: chatMeta["abc123"] = { chatId, text, senderId, at, unread }
let chatMeta = {};

// The display name typed on the register form. It is used once, when the
// profile document is created for a brand new account.
let pendingDisplayName = null;

// People I have blocked: { theirUid: millisecondsWhenBlocked }.
// Stored privately in userPrivate/{myUid}; the other person never sees it.
let myBlockedAt = {};
let blockTargetUser = null;

// Waiting-for-approval screen listener, and admin "new request" tracking.
let pendingUnsub = null;
let lastPendingKey = null;

// Prevents double-sending when Send / Enter is pressed twice quickly.
let isSending = false;

// True while we have told Firestore "I am typing" (so we do not write on every key).
let typingActive = false;

let pendingReply = null;
let groupCreateSelected = new Set();
let groupAddSelected = new Set();
let pendingGroupPhoto = "";
// The message being edited in the composer (WhatsApp-style), if any.
let editingMessage = null;
let peerTyping = false;
let heartbeatTimer = null;
let typingTimer = null;
let skipMessageNotify = true;

let currentCallId = null;
let currentCallChatId = null;
let currentCallType = null;
let peerConnection = null;
let localStream = null;
let incomingCallData = null;
let recorder = null;
let voiceChunks = [];

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

const $ = id => document.getElementById(id);

const authPage = $("authPage");
const appPage = $("appPage");
const nameInput = $("name");
const emailInput = $("email");
const passwordInput = $("password");
const loginBtn = $("loginBtn");
const registerBtn = $("registerBtn");
const logoutBtn = $("logoutBtn");
const authMessage = $("authMessage");
const myName = $("myName");
const myAvatar = $("myAvatar");
const myStatus = $("myStatus");
const blockedBanner = $("blockedBanner");
const usersList = $("usersList");
const searchInput = $("searchInput");
const chatName = $("chatName");
const chatStatus = $("chatStatus");
const chatAvatar = $("chatAvatar");
const messages = $("messages");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const composerBar = $("composerBar");
const emojiBtn = $("emojiBtn");
const emojiPicker = $("emojiPicker");
const emojiSearch = $("emojiSearch");
const emojiGrid = $("emojiGrid");
const gifGrid = $("gifGrid");
const stickerGrid = $("stickerGrid");
const fileBtn = $("fileBtn");
const fileInput = $("fileInput");
const voiceBtn = $("voiceBtn");
const replyBar = $("replyBar");
const replyText = $("replyText");
const cancelReply = $("cancelReply");
const audioCallBtn = $("audioCallBtn");
const videoCallBtn = $("videoCallBtn");
const directCallActions = $("directCallActions");
const backBtn = $("backBtn");
const callWindow = $("callWindow");
const callTitle = $("callTitle");
const callState = $("callState");
const remoteVideo = $("remoteVideo");
const localVideo = $("localVideo");
const remoteAudio = $("remoteAudio");
const muteCallBtn = $("muteCallBtn");
const cameraCallBtn = $("cameraCallBtn");
const endCallBtn = $("endCallBtn");
const incomingCall = $("incomingCall");
const incomingTitle = $("incomingTitle");
const acceptCallBtn = $("acceptCallBtn");
const rejectCallBtn = $("rejectCallBtn");
const settingsBtn = $("settingsBtn");
const settingsPanel = $("settingsPanel");
const settingsName = $("settingsName");
const themeSelect = $("themeSelect");
const notifyToggle = $("notifyToggle");
const saveSettings = $("saveSettings");
const currentPasswordInput = $("currentPasswordInput");
const newPasswordInput = $("newPasswordInput");
const confirmPasswordInput = $("confirmPasswordInput");
const changePasswordBtn = $("changePasswordBtn");
const passwordChangeMessage = $("passwordChangeMessage");
const groupsTab = $("groupsTab");
const peopleTab = $("peopleTab");
const newGroupBtn = $("newGroupBtn");
const groupPanel = $("groupPanel");
const groupName = $("groupName");
const groupMembers = $("groupMembers");
const createGroupBtn = $("createGroupBtn");
const groupAbout = $("groupAbout");
const groupPhotoInput = $("groupPhotoInput");
const groupPhotoPreview = $("groupPhotoPreview");
const groupMemberSearch = $("groupMemberSearch");
const selectedGroupMembers = $("selectedGroupMembers");
const groupCreateCount = $("groupCreateCount");
const groupCreateHint = $("groupCreateHint");
const groupInfoPanel = $("groupInfoPanel");
const closeGroupInfoBtn = $("closeGroupInfoBtn");
const groupInfoAvatar = $("groupInfoAvatar");
const groupInfoName = $("groupInfoName");
const groupInfoAbout = $("groupInfoAbout");
const groupInfoCount = $("groupInfoCount");
const groupParticipantsTitle = $("groupParticipantsTitle");
const groupParticipantsList = $("groupParticipantsList");
const groupParticipantSearch = $("groupParticipantSearch");
const groupEditPermission = $("groupEditPermission");
const groupSendPermission = $("groupSendPermission");
const groupAddPermission = $("groupAddPermission");
const saveGroupSettingsBtn = $("saveGroupSettingsBtn");
const editGroupInfoBtn = $("editGroupInfoBtn");
const addGroupMembersBtn = $("addGroupMembersBtn");
const leaveGroupBtn = $("leaveGroupBtn");
const groupAddMembersPanel = $("groupAddMembersPanel");
const closeGroupAddMembersBtn = $("closeGroupAddMembersBtn");
const groupAddMembersList = $("groupAddMembersList");
const groupAddSearch = $("groupAddSearch");
const selectedAddMembers = $("selectedAddMembers");
const groupAddCount = $("groupAddCount");
const confirmAddMembersBtn = $("confirmAddMembersBtn");
const adminPanelBtn = $("adminPanelBtn");
const pendingPage = $("pendingPage");
const pendingName = $("pendingName");
const pendingLogoutBtn = $("pendingLogoutBtn");
const adminPanel = $("adminPanel");
const adminUsersList = $("adminUsersList");
const totalUsers = $("totalUsers");
const onlineUsers = $("onlineUsers");
const blockedUsers = $("blockedUsers");
const typingIndicator = $("typingIndicator");
const replyLabel = $("replyLabel");
const storiesBar = $("storiesBar");
const wallpaperBtn = $("wallpaperBtn");
const chatProfileBtn = $("chatProfileBtn");
const openProfileFromSettings = $("openProfileFromSettings");

function isAdmin() {
    if (isSuperAdmin(currentUser)) return true;
    // Users promoted via the admin panel's "Make Admin" button.
    return Boolean(currentProfile?.admin);
}

function isSuperAdmin(user) {
    const email = (user?.email || "").trim().toLowerCase();
    return Boolean(email) && SUPER_ADMIN_EMAILS.includes(email);
}

// Removed people keep their Firebase Auth account (only a server can delete
// that), so we mark the profile instead and treat it as gone everywhere.
function isAccountRemoved(profile = currentProfile) {
    return Boolean(profile?.removed) && !isSuperAdmin(profile);
}

async function signOutRemovedAccount() {
    await stopCall(false);
    resetSessionListeners();
    await signOut(auth);
    authMessage.textContent = "Your account was removed by an admin.";
}

function isAccountBlocked() {
    return Boolean(currentProfile?.blocked) && !isAdmin();
}

// New accounts wait for an admin. Profiles made before approval existed have
// no "approved" field, so they count as approved.
function isPendingApproval(profile = currentProfile) {
    return profile?.approved === false && !isSuperAdmin(currentUser);
}

function isBlockedByMe(user) {
    return Boolean(user?.uid) && Object.prototype.hasOwnProperty.call(myBlockedAt, user.uid);
}

function escapeHTML(value) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, ch => map[ch]);
}

function getInitial(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
}

function safePhoto(src) {
    return typeof src === "string" && (src.startsWith("data:image/") || src.startsWith("https://"))
        ? src
        : "";
}

// Inner HTML for a round avatar: the profile photo, or the first letter.
function avatarHTML(profile) {
    const photo = safePhoto(profile?.photoURL);
    return photo
        ? `<img src="${escapeHTML(photo)}" alt="">`
        : escapeHTML(getInitial(profile?.name || profile?.email));
}

function toMillis(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    return value.toMillis?.() ?? 0;
}

function isOnline(user) {
    if (user?.status !== "online") return false;
    const seen = toMillis(user.lastSeen);
    return !seen || Date.now() - seen < ONLINE_WINDOW;
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function clockTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// "Today", "Yesterday", "Monday" or a date — used for dividers and the list.
function dayLabel(date) {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (sameDay(date, today)) return "Today";
    if (sameDay(date, yesterday)) return "Yesterday";
    if (Date.now() - date.getTime() < 6 * 86400000) {
        return date.toLocaleDateString([], { weekday: "long" });
    }
    return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function listTime(ms) {
    if (!ms) return "";
    const date = new Date(ms);
    return sameDay(date, new Date()) ? clockTime(date) : dayLabel(date);
}

function lastSeenText(user) {
    if (isOnline(user)) return "online";
    const seen = toMillis(user?.lastSeen);
    if (!seen) return "offline";
    const date = new Date(seen);
    const day = dayLabel(date);
    return day === "Today" || day === "Yesterday"
        ? `last seen ${day.toLowerCase()} at ${clockTime(date)}`
        : `last seen ${day}`;
}

const ICONS = {
    check: '<svg viewBox="0 0 16 11" aria-hidden="true"><path d="M11.1.7 4.5 8 1.6 5.2.5 6.4l4 3.7 7.7-8.4z"/></svg>',
    checks: '<svg viewBox="0 0 16 11" aria-hidden="true"><path d="M11.1.7 4.5 8 1.6 5.2.5 6.4l4 3.7 7.7-8.4z"/><path d="M15.1.7 8.5 8l-.9-.8-1.1 1.2 2.1 1.9 7.6-8.4z"/></svg>',
    clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
};

// Tick marks for my own messages: pending, sent, delivered or seen (blue).
function ticksHTML(state, createdMs) {
    const icon = state === "pending" ? ICONS.clock : state === "sent" ? ICONS.check : ICONS.checks;
    const attr = createdMs === undefined ? "" : ` data-created="${createdMs}"`;
    return `<span class="ticks ${state}"${attr}>${icon}</span>`;
}

// Stories and chat wallpapers are not built yet; these keep callers safe.
function renderStoriesBar() {}
function applyWallpaper() {}

function chatIdFor(a, b) {
    return [a, b].sort().join("_");
}

function activeChatId() {
    if (selectedGroup) return selectedGroup.id;
    if (selectedUser && currentUser) {
        return chatIdFor(currentUser.uid, selectedUser.uid);
    }
    return null;
}

function messagesCollection() {
    const id = activeChatId();
    if (!id) return null;
    if (selectedGroup) {
        return collection(db, "groups", id, "messages");
    }
    return collection(db, "chats", id, "messages");
}

function messageRef(id) {
    const chatId = activeChatId();
    if (selectedGroup) {
        return doc(db, "groups", chatId, "messages", id);
    }
    return doc(db, "chats", chatId, "messages", id);
}

function safeMediaSrc(src) {
    if (typeof src !== "string") return "";
    if (src.startsWith("data:image/") || src.startsWith("data:audio/")) return src;
    if (src.startsWith("https://")) return src;
    return "";
}

function previewText(msg) {
    if (msg.type === "image") return "📷 Photo";
    if (msg.type === "voice") return "🎤 Voice message";
    if (msg.type === "gif") return "GIF";
    if (msg.type === "story-reply") return `Replied to a story: ${(msg.text || "").slice(0, 60)}`;
    return (msg.text || "").slice(0, 80);
}

function applyTheme(theme) {
    const dark = theme === "dark";
    document.body.classList.toggle("dark", dark);
    if (themeSelect) themeSelect.value = dark ? "dark" : "light";
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}

function notificationsEnabled() {
    return localStorage.getItem(NOTIFY_KEY) === "1";
}

function friendlyError(error) {
    const map = {
        "auth/invalid-credential": "Wrong email or password.",
        "auth/user-not-found": "Account not found.",
        "auth/wrong-password": "Wrong password.",
        "auth/email-already-in-use": "This email is already registered.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-email": "Invalid email address.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "auth/requires-recent-login": "Please log out and log back in, then try again.",
        "auth/network-request-failed": "Network error. Check your internet connection.",
        "permission-denied": "You do not have permission to do that.",
        "unavailable": "The server is unreachable. Check your internet connection."
    };
    return map[error?.code] || error?.message || "Something went wrong.";
}

function clearUnsub(ref) {
    if (typeof ref === "function") {
        try { ref(); } catch { /* ignore */ }
    }
}

// Small pop-up message at the bottom of the screen (used for errors and info).
let toastTimer = null;
function showToast(text) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        toast.setAttribute("role", "status");
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 5000);
}

// Every Firestore listener gets an error callback. Without one, a rejected or
// broken listener stops silently and the screen looks frozen.
function handleListenError(label, error, container = null) {
    console.error(`Firestore listener failed (${label}):`, error);
    showToast(`Connection problem (${label}): ${friendlyError(error)}`);
    if (container) {
        container.innerHTML = `<div class="empty-chat">Could not load ${escapeHTML(label)}.<br>${escapeHTML(friendlyError(error))}<br>Reload the page to try again.</div>`;
    }
}

function resetSessionListeners() {
    clearUnsub(unsubscribeMe);
    clearUnsub(unsubscribeUsers);
    clearUnsub(unsubscribeGroups);
    clearUnsub(unsubscribeMessages);
    clearUnsub(unsubscribeTyping);
    clearUnsub(unsubscribeCalls);
    clearUnsub(unsubscribeInbox);
    extraUnsubs.forEach(clearUnsub);
    extraUnsubs = [];
    watchedCallChats.clear();
    myBlockedAt = {};
    lastPendingKey = null;
    unsubscribeMe = unsubscribeUsers = unsubscribeGroups = null;
    unsubscribeMessages = unsubscribeTyping = unsubscribeCalls = null;
    unsubscribeInbox = null;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    chatMeta = {};
}

function showEmptyChat() {
    messages.innerHTML = `
        <div class="empty-chat welcome">
            <div class="welcome-icon">💬</div>
            <h2>PD Chat</h2>
            <p>Pick a chat from the list, or tap a story at the top to see what your friends are up to.</p>
        </div>
    `;
    peerTyping = false;
}

// Clears any reply or edit that is waiting in the composer.
function clearComposerContext() {
    const wasEditing = Boolean(editingMessage);
    pendingReply = null;
    editingMessage = null;
    replyBar.classList.add("hidden");
    if (wasEditing) messageInput.value = "";
    updateComposerButtons();
}

// WhatsApp shows the microphone when the box is empty and Send otherwise.
function updateComposerButtons() {
    composerBar.classList.toggle("has-text", Boolean(messageInput.value.trim()));
}

// Header line under the chat name: typing…, online, or last seen.
function refreshChatStatus() {
    chatStatus.classList.remove("typing");
    if (selectedGroup) {
        chatStatus.textContent = `${(selectedGroup.members || []).length} members`;
        return;
    }
    if (!selectedUser) return;
    if (peerTyping) {
        chatStatus.textContent = "typing…";
        chatStatus.classList.add("typing");
        return;
    }
    chatStatus.textContent = lastSeenText(selectedUser);
}

const DEFAULT_PLACEHOLDER = messageInput?.placeholder || "Type a message";
function updateComposerState() {
    const iBlockedThem = Boolean(selectedUser) && isBlockedByMe(selectedUser);
    const ready = Boolean(activeChatId()) && !isAccountBlocked() && !iBlockedThem;
    composerBar.classList.toggle("disabled", !ready);
    if (messageInput) {
        messageInput.disabled = !ready;
        messageInput.placeholder = iBlockedThem
            ? "You blocked this contact. Unblock to send messages."
            : DEFAULT_PLACEHOLDER;
    }
    directCallActions.classList.toggle("hidden", Boolean(selectedGroup) || !selectedUser);
}

function updateBlockedBanner() {
    blockedBanner.classList.toggle("hidden", !isAccountBlocked());
    myStatus.textContent = isAccountBlocked() ? "Suspended" : "Online";
}

function renderHeaderIdle() {
    chatName.textContent = "Select a chat";
    chatStatus.textContent = "Choose a person or group";
    chatStatus.classList.remove("typing");
    chatAvatar.textContent = "?";
    clearComposerContext();
    showEmptyChat();
    updateComposerState();
    applyWallpaper();
}

function visibleUsers() {
    const term = searchInput.value.trim().toLowerCase();
    return allUsers.filter(user => {
        if (user.removed || user.approved === false) return false;
        if (!isAdmin() && user.blocked) return false;
        if (!term) return true;
        return (user.name || "").toLowerCase().includes(term) ||
            (user.email || "").toLowerCase().includes(term);
    });
}

function visibleGroups() {
    const term = searchInput.value.trim().toLowerCase();
    return allGroups.filter(group => {
        const mine = (group.members || []).includes(currentUser.uid);
        if (!mine) return false;
        if (!term) return true;
        return (group.name || "").toLowerCase().includes(term);
    });
}

// Text shown under a person's name in the sidebar.
function sidebarPreview(user) {
    if (isBlockedByMe(user)) return "🚫 Blocked";
    const meta = chatMeta[user.uid];
    if (!meta || !meta.text) {
        return escapeHTML(user.bio || (isOnline(user) ? "online" : "Hey there! I am using PD Chat."));
    }
    const tick = meta.senderId === currentUser.uid ? ticksHTML(receiptState(meta, meta.atMs)) : "";
    return tick + escapeHTML(meta.text);
}

// Read-receipt state of one of MY messages in a direct chat.
function receiptState(meta, createdMs) {
    if (!createdMs) return "pending";
    if (!meta) return "sent";
    if (meta.otherReadAt >= createdMs) return "seen";
    if (meta.otherDeliveredAt >= createdMs) return "delivered";
    return "sent";
}

function renderPeople() {
    usersList.innerHTML = "";

    // People you chatted with most recently come first, then alphabetical.
    const list = visibleUsers().sort((a, b) =>
        (chatMeta[b.uid]?.at || 0) - (chatMeta[a.uid]?.at || 0) ||
        (a.name || "").localeCompare(b.name || "")
    );

    if (!list.length) {
        usersList.innerHTML = `<div class="empty-chat">No people found.</div>`;
        return;
    }

    list.forEach(user => {
        const row = document.createElement("div");
        row.className = "user-item";
        if (selectedUser?.uid === user.uid) row.classList.add("active");

        const unread = isBlockedByMe(user) ? 0 : (chatMeta[user.uid]?.unread || 0);

        row.innerHTML = `
            <div class="avatar-wrap">
                <div class="avatar">${avatarHTML(user)}</div>
                ${isOnline(user) ? '<span class="online-dot"></span>' : ""}
            </div>
            <div class="user-info">
                <div class="user-info-top">
                    <strong>${escapeHTML(user.name || user.email)}${isSuperAdmin(user) || user.admin ? ' <span class="crown" title="Admin">👑</span>' : ""}</strong>
                    <span class="chat-time ${unread ? "unread" : ""}">${escapeHTML(listTime(chatMeta[user.uid]?.atMs))}</span>
                </div>
                <div class="user-info-bottom">
                    <small>${sidebarPreview(user)}</small>
                    ${unread ? `<span class="unread-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
                </div>
            </div>
        `;

        row.addEventListener("click", () => openUser(user));
        usersList.appendChild(row);
    });
}

function renderGroups() {
    usersList.innerHTML = "";
    const list = visibleGroups();

    if (!list.length) {
        usersList.innerHTML = `<div class="empty-chat">No groups yet. Use the ＋ button at the top to create one.</div>`;
        return;
    }

    list.forEach(group => {
        const row = document.createElement("div");
        row.className = "user-item";
        if (selectedGroup?.id === group.id) row.classList.add("active");

        row.innerHTML = `
            <div class="avatar-wrap">
                <div class="avatar group-avatar">${escapeHTML(getInitial(group.name))}</div>
            </div>
            <div class="user-info">
                <div class="user-info-top">
                    <strong>${escapeHTML(group.name || "Group")}</strong>
                    <span class="chat-time">${escapeHTML(listTime(toMillis(group.lastMessageAt)))}</span>
                </div>
                <div class="user-info-bottom">
                    <small>${escapeHTML(group.lastMessage || `${(group.members || []).length} members`)}</small>
                </div>
            </div>
        `;

        row.addEventListener("click", () => openGroup(group));
        usersList.appendChild(row);
    });
}

function renderSidebar() {
    if (sidebarTab === "groups") renderGroups();
    else renderPeople();
}

function setSidebarTab(tab) {
    sidebarTab = tab;
    peopleTab.classList.toggle("active", tab === "people");
    groupsTab.classList.toggle("active", tab === "groups");
    searchInput.placeholder = tab === "groups" ? "Search groups" : "Search or start a new chat";
    renderSidebar();
}

async function openUser(user) {
    if (user.blocked && !isAdmin()) return;

    selectedUser = user;
    selectedGroup = null;
    appPage.classList.add("chat-open");

    chatName.textContent = user.name || user.email;
    chatAvatar.innerHTML = avatarHTML(user);
    chatAvatar.classList.remove("group-avatar");
    peerTyping = false;
    refreshChatStatus();

    clearComposerContext();
    updateComposerState();
    applyWallpaper();
    typingActive = false;
    listenMessages();
    listenTyping();
    renderSidebar();
    markChatRead();
    messageInput.focus();
}

async function openGroup(group) {
    selectedGroup = group;
    selectedUser = null;
    appPage.classList.add("chat-open");

    chatName.textContent = group.name || "Group";
    if (group.photoURL) chatAvatar.innerHTML = `<img src="${escapeHTML(group.photoURL)}" alt="">`;
    else chatAvatar.textContent = getInitial(group.name);
    chatAvatar.classList.add("group-avatar");
    peerTyping = false;
    refreshChatStatus();

    clearComposerContext();
    clearUnsub(unsubscribeTyping);
    unsubscribeTyping = null;
    updateComposerState();
    applyWallpaper();
    listenMessages();
    renderSidebar();
    messageInput.focus();
}

function backToChats() {
    selectedUser = null;
    selectedGroup = null;
    appPage.classList.remove("chat-open");
    clearUnsub(unsubscribeMessages);
    clearUnsub(unsubscribeTyping);
    unsubscribeMessages = unsubscribeTyping = null;
    renderHeaderIdle();
    renderSidebar();
}

function listenOwnProfile() {
    clearUnsub(unsubscribeMe);
    unsubscribeMe = onSnapshot(doc(db, "users", currentUser.uid), snap => {
        if (!snap.exists()) return;
        currentProfile = { id: snap.id, ...snap.data() };
        if (isAccountRemoved()) {
            signOutRemovedAccount();
            return;
        }
        myName.textContent = currentProfile.name + (isAdmin() ? " 👑 Admin" : "");
        displayProfileAvatar(myAvatar, currentProfile);
        settingsName.value = currentProfile.name || "";
        updateBlockedBanner();
        updateComposerState();
        renderStoriesBar();
        if (isAdmin()) {
            adminPanelBtn.classList.remove("hidden");
        } else {
            adminPanelBtn.classList.add("hidden");
            adminPanel.classList.add("hidden");
        }
        if (sidebarTab === "people") renderPeople();
    });
}

function listenUsers() {
    clearUnsub(unsubscribeUsers);
    unsubscribeUsers = onSnapshot(collection(db, "users"), snapshot => {
        // The document ID is always the user's uid, so we use it as the source
        // of truth instead of trusting a field stored inside the document.
        allUsers = snapshot.docs
            .map(d => ({ ...d.data(), id: d.id, uid: d.id }))
            .filter(u => u.id !== currentUser.uid);
        if (sidebarTab === "people") renderPeople();
        renderStoriesBar();
        updatePendingBadge();
        if (selectedUser) {
            const fresh = allUsers.find(u => u.uid === selectedUser.uid);
            if (fresh) {
                selectedUser = fresh;
                refreshChatStatus();
            }
        }
    }, error => handleListenError("people list", error));
}

// Admins: show how many people are waiting to be let in, and tell them when
// a new request arrives.
function updatePendingBadge() {
    if (!isAdmin()) return;
    const pending = allUsers.filter(u => u.approved === false && !u.removed);
    adminPanelBtn.setAttribute("data-badge", pending.length ? String(pending.length) : "");

    const key = pending.map(u => u.uid).sort().join(",");
    if (lastPendingKey !== null && key !== lastPendingKey) {
        const previous = new Set(lastPendingKey.split(",").filter(Boolean));
        const fresh = pending.find(u => !previous.has(u.uid));
        if (fresh) showToast(`${fresh.name || fresh.email} wants to join. Open the Admin Panel to accept or reject.`);
        if (!adminPanel.classList.contains("hidden")) loadAdminPanel();
    }
    lastPendingKey = key;
}

// My private list of blocked people (only I can read it).
function listenPrivate() {
    extraUnsubs.push(onSnapshot(doc(db, "userPrivate", currentUser.uid), snap => {
        const before = selectedUser ? isBlockedByMe(selectedUser) : false;
        myBlockedAt = snap.exists() ? { ...(snap.data().blocked || {}) } : {};
        if (sidebarTab === "people") renderPeople();
        updateComposerState();
        refreshBlockButton();
        if (selectedUser && before !== isBlockedByMe(selectedUser)) listenMessages();
    }, error => console.warn("Could not load block list:", error)));
}

async function setBlocked(user, block) {
    const ref = doc(db, "userPrivate", currentUser.uid);
    try {
        if (block) {
            await setDoc(ref, { blocked: { [user.uid]: Date.now() } }, { merge: true });
            showToast(`${user.name || "Contact"} is blocked. Their new messages and calls will not reach you.`);
        } else {
            await updateDoc(ref, { [`blocked.${user.uid}`]: deleteField() });
            showToast(`${user.name || "Contact"} is unblocked.`);
        }
    } catch (error) {
        console.error("Block failed:", error);
        showToast(`Could not update block: ${friendlyError(error)}`);
    }
}

function refreshBlockButton() {
    const button = $("blockUserBtn");
    if (!button) return;
    const user = blockTargetUser;
    button.classList.toggle("hidden", !user);
    if (!user) return;
    button.textContent = isBlockedByMe(user) ? "✅ Unblock contact" : "🚫 Block contact";
}

$("blockUserBtn")?.addEventListener("click", async () => {
    const user = blockTargetUser;
    if (!user) return;
    if (isBlockedByMe(user)) {
        await setBlocked(user, false);
    } else if (confirm(`Block ${user.name || "this contact"}? You will not receive their new messages or calls.`)) {
        await setBlocked(user, true);
    }
});

chatProfileBtn?.addEventListener("click", () => {
    if (selectedUser) openPublicProfile(selectedUser);
    else if (selectedGroup) openGroupInfo();
});

function listenGroups() {
    clearUnsub(unsubscribeGroups);
    // Only groups that contain me (the security rules require this filter).
    const q = query(collection(db, "groups"), where("members", "array-contains", currentUser.uid));
    unsubscribeGroups = onSnapshot(q, snapshot => {
        allGroups = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (sidebarTab === "groups") renderGroups();
        if (selectedGroup) {
            const fresh = allGroups.find(g => g.id === selectedGroup.id);
            if (fresh) {
                selectedGroup = fresh;
                refreshChatStatus();
            }
        }
    }, error => handleListenError("groups", error));
}

// INBOX: one listener on "chats where I am a participant".
// It powers the sidebar previews, the unread badges and incoming-call detection.
// The sender updates the chat document in the SAME batch as the message,
// so the receiver is told about new messages even if that chat is not open.
function listenInbox() {
    clearUnsub(unsubscribeInbox);
    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));

    unsubscribeInbox = onSnapshot(q, snapshot => {
        const me = currentUser.uid;
        const next = {};
        snapshot.docs.forEach(d => {
            // "estimate" gives pending server timestamps a local value, so a
            // receipt we just wrote does not look missing and get re-sent.
            const data = d.data({ serverTimestamps: "estimate" });
            const otherUid = (data.participants || []).find(uid => uid !== me);
            if (!otherUid) return;

            const atMs = toMillis(data.lastMessageAt);
            next[otherUid] = {
                chatId: d.id,
                text: data.lastMessage || "",
                senderId: data.lastSenderId || null,
                at: atMs || Date.now(),
                atMs,
                unread: data.unread?.[me] || 0,
                myReadAt: toMillis(data.readAt?.[me]),
                myDeliveredAt: toMillis(data.deliveredAt?.[me]),
                otherReadAt: toMillis(data.readAt?.[otherUid]),
                otherDeliveredAt: toMillis(data.deliveredAt?.[otherUid])
            };

            // Their newest message reached my app: tell them (grey ✓✓).
            const meta = next[otherUid];
            if (meta.senderId && meta.senderId !== me && atMs > meta.myDeliveredAt) {
                writeReceipt(d.id, "deliveredAt");
            }

            watchCallsForChat(d.id);
        });
        chatMeta = next;

        if (sidebarTab === "people") renderPeople();
        markChatRead();
        updateTicks();
    }, error => handleListenError("chat list", error));
}

// Read receipts live on the shared chat document (readAt / deliveredAt per
// person), never on the other person's profile. If the security rules turn
// them down, we stop trying for this session instead of retrying forever.
const receiptWrites = new Set();
let receiptsUnavailable = false;
function writeReceipt(chatId, ...fields) {
    const key = chatId + fields.join();
    if (receiptsUnavailable || receiptWrites.has(key)) return;
    receiptWrites.add(key);
    const update = {};
    fields.forEach(field => { update[`${field}.${currentUser.uid}`] = serverTimestamp(); });
    updateDoc(doc(db, "chats", chatId), update)
        .catch(error => {
            console.warn("Read receipts unavailable:", error);
            receiptsUnavailable = true;
        })
        .finally(() => receiptWrites.delete(key));
}

// Refresh the ticks of my messages in the open chat without re-rendering it.
function updateTicks() {
    if (!selectedUser) return;
    const meta = chatMeta[selectedUser.uid];
    messages.querySelectorAll(".ticks[data-created]").forEach(el => {
        const created = Number(el.dataset.created);
        el.outerHTML = ticksHTML(receiptState(meta, created), created);
    });
}

// Set my unread counter to 0 for the chat that is open on screen.
function markChatRead() {
    if (!selectedUser || !currentUser || document.hidden) return;
    const meta = chatMeta[selectedUser.uid];
    if (!meta) return;

    if (meta.unread) {
        updateDoc(doc(db, "chats", meta.chatId), { [`unread.${currentUser.uid}`]: 0 })
            .catch(error => console.warn("Could not mark chat as read:", error));
    }

    // Blue ticks for the other person.
    if (meta.senderId && meta.senderId !== currentUser.uid && meta.atMs > meta.myReadAt) {
        writeReceipt(meta.chatId, "readAt", "deliveredAt");
    }
}

function listenTyping() {
    clearUnsub(unsubscribeTyping);
    peerTyping = false;
    if (!selectedUser) return;

    unsubscribeTyping = onSnapshot(doc(db, "users", selectedUser.uid), snap => {
        const data = snap.data() || {};
        peerTyping = data.typingTo === currentUser.uid;
        refreshChatStatus();
    });
}

function maybeNotify(msg) {
    if (skipMessageNotify || msg.senderId === currentUser.uid) return;
    if (myBlockedAt[msg.senderId]) return;
    if (document.hidden !== true) return;
    if (!notificationsEnabled() || Notification.permission !== "granted") return;
    const title = selectedGroup?.name || selectedUser?.name || "PD Chat";
    new Notification(title, { body: previewText(msg) });
}

function listenMessages() {
    clearUnsub(unsubscribeMessages);
    unsubscribeMessages = null;
    const ref = messagesCollection();
    if (!ref) return;

    skipMessageNotify = true;
    let firstSnapshot = true;
    messages.innerHTML = `<div class="empty-chat">Loading messages…</div>`;

    // No orderBy here on purpose: a query with orderBy("createdAt") silently
    // leaves out every message that has no createdAt yet (or never had one),
    // which looks like "the other person's messages did not arrive". We sort
    // on this side instead, so nothing that exists in the chat can be dropped.
    unsubscribeMessages = onSnapshot(ref, snapshot => {
        // Only jump to the bottom if the user was already near it
        // (so reading old messages is not interrupted by a new reaction).
        const distanceFromBottom =
            messages.scrollHeight - messages.scrollTop - messages.clientHeight;
        const wasNearBottom = firstSnapshot || distanceFromBottom < 150;

        const items = snapshot.docs.map(d => {
            // "estimate" gives a message that is still being sent a time
            // right now, so it sorts to the bottom instead of the top.
            const sortKey = toMillis(d.data({ serverTimestamps: "estimate" }).createdAt);
            return { msg: { id: d.id, ...d.data() }, sortKey };
        }).sort((a, b) => a.sortKey - b.sortKey);

        messages.innerHTML = "";
        let shown = 0;
        let lastShown = null;

        items.forEach(({ msg }) => {
            if (Array.isArray(msg.deletedFor) && msg.deletedFor.includes(currentUser.uid)) return;

            // Messages from someone I blocked, sent after I blocked them, stay hidden.
            if (msg.senderId !== currentUser.uid && myBlockedAt[msg.senderId]) {
                const sentMs = toMillis(msg.createdAt) || Date.now();
                if (sentMs >= myBlockedAt[msg.senderId]) return;
            }

            // One damaged message must never blank the whole conversation.
            try {
                renderMessage(msg);
                shown++;
                lastShown = msg;
            } catch (error) {
                console.error("Could not draw message", msg.id, error);
            }
        });

        if (!shown) {
            messages.innerHTML = `<div class="empty-chat">No messages yet. Say hello.</div>`;
        }

        if (wasNearBottom || lastShown?.senderId === currentUser.uid) {
            messages.scrollTop = messages.scrollHeight;
        }

        if (!skipMessageNotify) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    maybeNotify({ id: change.doc.id, ...change.doc.data() });
                }
            });
        }

        skipMessageNotify = false;
        firstSnapshot = false;
        markChatRead();
    }, error => handleListenError("messages", error, messages));
}

function bindMessageMenu(bubble, wrapper, msg) {
    bubble.addEventListener("contextmenu", event => {
        event.preventDefault();
        openMessageMenu(wrapper, msg);
    });

    let timer = null;
    bubble.addEventListener("touchstart", () => {
        timer = setTimeout(() => openMessageMenu(wrapper, msg), 500);
    }, { passive: true });
    bubble.addEventListener("touchend", () => clearTimeout(timer));
    bubble.addEventListener("touchmove", () => clearTimeout(timer));
}

function renderMessage(msg) {
    const mine = msg.senderId === currentUser.uid;

    // Group notices such as "Sam created the group".
    if (msg.system) {
        const note = document.createElement("div");
        note.className = "system-note";
        note.innerHTML = `<span>${escapeHTML(msg.text || "")}</span>`;
        messages.appendChild(note);
        return;
    }

    const row = document.createElement("div");
    row.className = "message-row " + (mine ? "mine" : "");

    const wrapper = document.createElement("div");
    wrapper.className = "message";
    const deleted = Boolean(msg.deleted);
    if (msg.pinned && !deleted) wrapper.classList.add("pinned");

    let body = "";
    if (deleted) {
        body = '<span class="deleted-text">🚫 This message was deleted</span>';
    } else if (msg.type === "image" || msg.type === "gif") {
        const src = safeMediaSrc(msg.data);
        body = src ? `<img src="${escapeHTML(src)}" alt="">` : "[image]";
    } else if (msg.type === "voice") {
        const src = safeMediaSrc(msg.data);
        body = src ? `<audio controls src="${escapeHTML(src)}"></audio>` : "[voice]";
    } else {
        body = escapeHTML(msg.text || "");
    }

    let reply = "";
    if (msg.replyTo && !deleted) {
        reply = `
            <div class="reply-preview">
                ↪ ${escapeHTML(msg.replyTo.text || "")}
            </div>
        `;
    }

    let reactions = "";
    if (msg.reactions && !deleted) {
        reactions = Object.entries(msg.reactions)
            .map(([emoji, users]) => Array.isArray(users) && users.length
                ? `<span class="reaction">${escapeHTML(emoji)} ${users.length}</span>`
                : "")
            .join("");
    }

    const created = msg.createdAt?.toDate ? msg.createdAt.toDate() : null;
    const createdMs = created ? created.getTime() : 0;
    const time = created
        ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

    // Ticks on my own messages: clock (sending), ✓ sent, ✓✓ delivered, blue ✓✓ read.
    let tick = "";
    if (mine && !deleted) {
        if (selectedGroup) {
            tick = ticksHTML(createdMs ? "sent" : "pending");
        } else {
            const meta = selectedUser ? chatMeta[selectedUser.uid] : null;
            tick = ticksHTML(receiptState(meta, createdMs), createdMs);
        }
    }

    wrapper.innerHTML = `
        <div class="bubble${deleted ? " deleted" : ""}">
            ${reply}
            <div class="msg-body">${body}</div>
            ${msg.edited && !deleted ? '<span class="edited"> edited</span>' : ""}
            <div class="message-time">${time}${tick}</div>
            ${reactions ? `<div class="reactions">${reactions}</div>` : ""}
        </div>
    `;

    // A deleted message has nothing left to reply to, react to or delete again.
    if (!deleted) bindMessageMenu(wrapper.querySelector(".bubble"), wrapper, msg);
    row.appendChild(wrapper);
    messages.appendChild(row);
}

function openMessageMenu(container, msg) {
    document.querySelectorAll(".message-menu").forEach(x => x.remove());

    const menu = document.createElement("div");
    menu.className = "message-menu";
    menu.innerHTML = `
        <button data-action="reply" type="button">↩️ Reply</button>
        <button data-action="react" type="button">❤️ React</button>
        <button data-action="copy" type="button">📋 Copy</button>
        <button data-action="pin" type="button">📌 ${msg.pinned ? "Unpin" : "Pin"}</button>
        ${
            msg.senderId === currentUser.uid
                ? `<button data-action="edit" type="button">✏️ Edit</button>
                   <button data-action="delete" type="button">🗑️ Delete</button>`
                : ""
        }
        ${!selectedGroup ? `<button data-action="forward" type="button">↗️ Forward</button>` : ""}
    `;

    container.appendChild(menu);

    menu.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", async () => {
            const action = button.dataset.action;

            if (action === "reply") {
                pendingReply = { id: msg.id, text: msg.text || previewText(msg) };
                replyText.textContent = pendingReply.text;
                replyBar.classList.remove("hidden");
                messageInput.focus();
            }

            if (action === "react") {
                const emoji = prompt("Enter one emoji:");
                if (emoji) await reactToMessage(msg, [...emoji][0]);
            }

            if (action === "copy") {
                await navigator.clipboard.writeText(msg.text || "");
            }

            if (action === "pin") {
                await updateDoc(messageRef(msg.id), { pinned: !msg.pinned });
            }

            if (action === "edit") {
                const text = prompt("Edit message:", msg.text || "");
                if (text?.trim()) {
                    await updateDoc(messageRef(msg.id), {
                        text: text.trim(),
                        edited: true,
                        editedAt: serverTimestamp()
                    });
                }
            }

            if (action === "delete" && confirm("Delete this message?")) {
                await updateDoc(messageRef(msg.id), {
                    deleted: true,
                    text: "",
                    data: null,
                    replyTo: null,
                    reactions: {},
                    pinned: false
                });
            }

            if (action === "forward") await forwardMessage(msg);
            menu.remove();
        });
    });
}

async function reactToMessage(msg, emoji) {
    const reactions = { ...(msg.reactions || {}) };
    const users = reactions[emoji] || [];
    reactions[emoji] = users.includes(currentUser.uid)
        ? users.filter(x => x !== currentUser.uid)
        : [...users, currentUser.uid];
    await updateDoc(messageRef(msg.id), { reactions });
}

// Write ONE direct message plus the chat summary document in a single batch.
// Either both succeed or neither does, so the receiver's inbox can never be
// out of sync with the messages. Nothing is ever written to the other
// person's user document (the security rules do not allow that).
async function writeDirectMessage(otherUid, message, preview) {
    const chatId = chatIdFor(currentUser.uid, otherUid);
    const chatRef = doc(db, "chats", chatId);
    const messageDoc = doc(collection(db, "chats", chatId, "messages"));

    const batch = writeBatch(db);
    batch.set(messageDoc, { ...message, receiverId: otherUid });
    batch.set(chatRef, {
        participants: [currentUser.uid, otherUid].sort(),
        lastMessage: preview,
        lastSenderId: currentUser.uid,
        lastMessageAt: serverTimestamp(),
        unread: { [otherUid]: increment(1) }
    }, { merge: true });

    await batch.commit();
}

async function forwardMessage(msg) {
    if (isAccountBlocked()) return;

    const target = prompt("Enter the email of the person to forward to:");
    if (!target) return;

    const user = allUsers.find(
        x => (x.email || "").toLowerCase() === target.trim().toLowerCase()
    );
    if (!user) {
        alert("User not found.");
        return;
    }
    if (user.blocked && !isAdmin()) {
        alert("You cannot forward to this user.");
        return;
    }

    try {
        await writeDirectMessage(user.uid, {
            text: msg.text || previewText(msg),
            type: msg.type || "text",
            data: msg.data || null,
            senderId: currentUser.uid,
            forwarded: true,
            createdAt: serverTimestamp()
        }, previewText(msg));
        showToast("Message forwarded.");
    } catch (error) {
        console.error("Forward failed:", error);
        showToast(`Could not forward: ${friendlyError(error)}`);
    }
}

// Group chats keep a small "last message" summary on the group document.
async function saveGroupPreview(group, text) {
    try {
        await updateDoc(doc(db, "groups", group.id), {
            lastMessage: text,
            lastMessageAt: serverTimestamp()
        });
    } catch (error) {
        // The message itself was already saved, so this is not fatal.
        console.warn("Could not update group preview:", error);
    }
}

// Sends one message to the chat that is currently open.
// Returns true when the message was saved, false when it was not.
async function postMessage(payload) {
    if (!currentUser || !activeChatId() || isAccountBlocked()) return false;
    if (selectedGroup && !groupMemberAllowed(selectedGroup, "sendMessages")) { showToast("Only group admins can send messages in this group."); return false; }
    if (selectedUser && isBlockedByMe(selectedUser)) {
        showToast("You blocked this contact. Unblock them to send messages.");
        return false;
    }

    // Remember the target now, in case the user switches chats while we wait.
    const targetUser = selectedUser;
    const targetGroup = selectedGroup;

    const message = {
        senderId: currentUser.uid,
        createdAt: serverTimestamp(),
        replyTo: pendingReply || null,
        ...payload
    };
    const preview = previewText(payload);

    try {
        if (targetUser) {
            await writeDirectMessage(targetUser.uid, message, preview);
        } else if (targetGroup) {
            await addDoc(collection(db, "groups", targetGroup.id, "messages"), message);
            await saveGroupPreview(targetGroup, preview);
        }
    } catch (error) {
        console.error("Send failed:", error);
        showToast(`Message not sent: ${friendlyError(error)}`);
        return false;
    }

    pendingReply = null;
    replyBar.classList.add("hidden");
    typingActive = false;
    await updateTyping(false);
    return true;
}

async function sendMessage() {
    if (isSending || !currentUser || !activeChatId() || isAccountBlocked()) return;
    const text = messageInput.value.trim();
    if (!text) return;

    isSending = true;
    try {
        const data = { text };
        if (selectedUser) data.receiverId = selectedUser.uid;

        // Only clear the box when the message really was saved,
        // otherwise the user would lose what they typed.
        const saved = await postMessage(data);
        if (saved) messageInput.value = "";
    } finally {
        isSending = false;
    }
}

async function updateTyping(value) {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            typingTo: value && selectedUser ? selectedUser.uid : null,
            typingAt: value ? serverTimestamp() : null
        });
    } catch { /* ignore */ }
}

// Passwords are handled only by Firebase Authentication. PD Chat never stores readable login passwords.

async function loadCurrentProfile() {
    const profileRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(profileRef);

    if (!snap.exists()) {
        const initialName = pendingDisplayName || currentUser.email.split("@")[0];
        pendingDisplayName = null;
        const superUser = isSuperAdmin(currentUser);
        currentProfile = {
            uid: currentUser.uid,
            name: initialName,
            email: currentUser.email,
            // New people wait for an admin, except the super admins.
            approved: superUser
        };
        await setDoc(profileRef, {
            ...currentProfile,
            status: superUser ? "online" : "offline",
            blocked: false,
            createdAt: serverTimestamp()
        });
    } else {
        pendingDisplayName = null;
        currentProfile = { id: snap.id, ...snap.data() };
        if (currentProfile.demoPasswordPlaintext) {
            // Legacy unsafe field: remove it when the owner next loads their profile.
            updateDoc(profileRef, { demoPasswordPlaintext: deleteField() }).catch(() => {});
            delete currentProfile.demoPasswordPlaintext;
        }
    }

    myName.textContent = currentProfile.name + (isAdmin() ? " 👑 Admin" : "");
    myAvatar.textContent = getInitial(currentProfile.name);
    settingsName.value = currentProfile.name || "";
    updateBlockedBanner();
}

async function setOnline() {
    await updateDoc(doc(db, "users", currentUser.uid), {
        status: "online",
        lastSeen: serverTimestamp()
    });
}

registerBtn?.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!name || !email || !password) {
        authMessage.textContent = "Enter your name, email and password.";
        return;
    }
    if (password.length < 6) {
        authMessage.textContent = "Password must contain at least 6 characters.";
        return;
    }

    try {
        authMessage.textContent = "Creating account...";
        // The profile document is created by loadCurrentProfile() as soon as
        // Firebase reports the new user. We just tell it which name to use.
        pendingDisplayName = name;
        await createUserWithEmailAndPassword(auth, email, password);
        authMessage.textContent = "";
    } catch (error) {
        pendingDisplayName = null;
        authMessage.textContent = error?.code === "auth/email-already-in-use"
            ? "This email is already registered. Use Login instead."
            : friendlyError(error);
    }
});

loginBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
        authMessage.textContent = "Enter email and password.";
        return;
    }
    try {
        authMessage.textContent = "Logging in...";
        await signInWithEmailAndPassword(auth, email, password);
        // Keeps the super-admin password record current (and fills it in for
        // accounts that were created before it existed).
    } catch (error) {
        authMessage.textContent = friendlyError(error);
    }
});

changePasswordBtn?.addEventListener("click", async () => {
    if (!currentUser) return;

    const current = currentPasswordInput.value;
    const next = newPasswordInput.value;
    const confirm = confirmPasswordInput.value;

    if (!current || !next || !confirm) {
        passwordChangeMessage.textContent = "Fill in all three fields.";
        return;
    }
    if (next.length < 6) {
        passwordChangeMessage.textContent = "New password must be at least 6 characters.";
        return;
    }
    if (next !== confirm) {
        passwordChangeMessage.textContent = "New passwords do not match.";
        return;
    }

    changePasswordBtn.disabled = true;
    passwordChangeMessage.textContent = "Updating password...";

    try {
        // Firebase requires a recent login before it will accept a password
        // change, so we re-prove identity with the current password first.
        const credential = EmailAuthProvider.credential(currentUser.email, current);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, next);


        passwordChangeMessage.textContent = "Password updated successfully.";
        currentPasswordInput.value = "";
        newPasswordInput.value = "";
        confirmPasswordInput.value = "";
    } catch (error) {
        passwordChangeMessage.textContent = friendlyError(error);
    } finally {
        changePasswordBtn.disabled = false;
    }
});

logoutBtn?.addEventListener("click", async () => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            status: "offline",
            lastSeen: serverTimestamp()
        });
    } catch { /* ignore */ }

    await stopCall(false);
    resetSessionListeners();
    await signOut(auth);
});

// Everything that runs once a person is approved and allowed in.
async function startApp() {
    pendingPage.classList.add("hidden");
    authPage.classList.add("hidden");
    appPage.classList.remove("hidden");

    // Going "online" failing must not stop the rest of the app from starting.
    try {
        await setOnline();
    } catch (error) {
        console.warn("Could not set online status:", error);
    }

    listenOwnProfile();
    listenUsers();
    listenGroups();
    listenInbox();
    listenPrivate();
    renderHeaderIdle();

    if (isAdmin()) adminPanelBtn.classList.remove("hidden");

    if (notificationsEnabled() && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

// Shown to a new person until an admin accepts them.
function showPendingScreen() {
    authPage.classList.add("hidden");
    appPage.classList.add("hidden");
    pendingPage.classList.remove("hidden");
    pendingName.textContent = currentProfile?.name || "there";

    clearUnsub(pendingUnsub);
    pendingUnsub = onSnapshot(doc(db, "users", currentUser.uid), async snap => {
        if (!snap.exists() || snap.data().removed) {
            clearUnsub(pendingUnsub);
            pendingUnsub = null;
            await signOut(auth);
            authMessage.textContent = "Your request to join was declined.";
            return;
        }
        if (snap.data().approved !== false) {
            clearUnsub(pendingUnsub);
            pendingUnsub = null;
            currentProfile = { id: snap.id, ...snap.data() };
            await startApp();
        }
    }, error => console.warn("Approval check failed:", error));
}

pendingLogoutBtn?.addEventListener("click", async () => {
    clearUnsub(pendingUnsub);
    pendingUnsub = null;
    await signOut(auth);
});

onAuthStateChanged(auth, async user => {
    currentUser = user;

    if (!user) {
        clearUnsub(pendingUnsub);
        pendingUnsub = null;
        resetSessionListeners();
        selectedUser = selectedGroup = currentProfile = null;
        allUsers = [];
        allGroups = [];
        authPage.classList.remove("hidden");
        pendingPage.classList.add("hidden");
        appPage.classList.add("hidden");
        appPage.classList.remove("chat-open");
        adminPanelBtn.classList.add("hidden");
        return;
    }

    authPage.classList.add("hidden");

    try {
        await loadCurrentProfile();
    } catch (error) {
        console.error("Could not load profile:", error);
        showToast(`Could not load your profile: ${friendlyError(error)}`);
        return;
    }

    if (isAccountRemoved()) {
        await signOutRemovedAccount();
        return;
    }

    if (isPendingApproval()) {
        showPendingScreen();
        return;
    }

    await startApp();
});

document.addEventListener("visibilitychange", async () => {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            status: document.hidden ? "away" : "online",
            lastSeen: serverTimestamp()
        });
    } catch { /* ignore */ }
    if (!document.hidden) markChatRead();
});

searchInput?.addEventListener("input", renderSidebar);
peopleTab?.addEventListener("click", () => setSidebarTab("people"));
groupsTab?.addEventListener("click", () => setSidebarTab("groups"));
newGroupBtn?.addEventListener("click", () => {
    groupPanel.classList.remove("hidden");
    loadGroupMembers();
});
$("closeGroupBtn")?.addEventListener("click", () => groupPanel.classList.add("hidden"));
backBtn?.addEventListener("click", backToChats);

sendBtn?.addEventListener("click", sendMessage);
messageInput?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

messageInput?.addEventListener("input", () => {
    if (!selectedUser) return;          // no typing indicator in groups yet

    // Tell Firestore only when typing STARTS, not on every key press.
    if (!typingActive) {
        typingActive = true;
        updateTyping(true);
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        typingActive = false;
        updateTyping(false);
    }, 2000);
});

fileBtn?.addEventListener("click", () => fileInput.click());
fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file || !activeChatId()) return;

    if (!file.type.startsWith("image/")) {
        alert("Only images can be sent here. Other files need Firebase Storage.");
        fileInput.value = "";
        return;
    }
    if (file.size > MAX_EMBED_BYTES) {
        alert("Image is too large. Choose an image below about 700 KB.");
        fileInput.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
        await postMessage({ type: "image", data: reader.result });
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
});

voiceBtn?.addEventListener("click", async () => {
    if (!activeChatId()) return;

    if (recorder) {
        recorder.stop();
        voiceBtn.textContent = "🎤";
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream);
        voiceChunks = [];

        recorder.ondataavailable = event => {
            if (event.data.size) voiceChunks.push(event.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(voiceChunks, { type: "audio/webm" });
            stream.getTracks().forEach(t => t.stop());

            if (blob.size > MAX_EMBED_BYTES) {
                alert("Voice message is too long.");
                recorder = null;
                return;
            }

            const reader = new FileReader();
            reader.onload = async () => {
                await postMessage({ type: "voice", data: reader.result });
            };
            reader.readAsDataURL(blob);
            recorder = null;
        };

        recorder.start();
        voiceBtn.textContent = "⏹️";
    } catch {
        alert("Microphone permission was not allowed.");
    }
});

cancelReply?.addEventListener("click", () => {
    pendingReply = null;
    replyBar.classList.add("hidden");
});

const emojis = [
    "😀","😃","😄","😁","😆","😅","😂","🤣",
    "😊","😍","🥰","😘","😎","🤩","🥳","😭",
    "😢","😡","🤔","😴","🤗","😱","👍","👎",
    "👏","🙏","💪","❤️","🧡","💛","💚","💙",
    "💜","🖤","🤍","🔥","✨","⭐","💯","🎉",
    "🎊","🎁","🚀","😇","😉","😌","🤝","👌",
    "✌️","🤟","👑","❤️‍🔥","🤣","😜","🤪"
];

function loadEmoji() {
    emojiGrid.innerHTML = "";
    emojis.forEach(emoji => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.onclick = () => {
            messageInput.value += emoji;
            messageInput.focus();
        };
        emojiGrid.appendChild(button);
    });
}

loadEmoji();

emojiBtn?.addEventListener("click", event => {
    event.stopPropagation();
    emojiPicker.classList.toggle("hidden");
});

document.querySelectorAll(".picker-tabs button").forEach(button => {
    button.addEventListener("click", () => {
        const tab = button.dataset.tab;
        emojiGrid.classList.add("hidden");
        gifGrid.classList.add("hidden");
        stickerGrid.classList.add("hidden");
        if (tab === "emoji") emojiGrid.classList.remove("hidden");
        if (tab === "gif") {
            gifGrid.classList.remove("hidden");
            loadGIFs();
        }
        if (tab === "sticker") {
            stickerGrid.classList.remove("hidden");
            loadStickers();
        }
    });
});

emojiSearch?.addEventListener("input", () => {
    const search = emojiSearch.value.trim();
    [...emojiGrid.children].forEach(button => {
        button.classList.toggle("hidden", Boolean(search) && !button.textContent.includes(search));
    });
});

function loadGIFs() {
    gifGrid.innerHTML = "";
    const gifs = [
        "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif",
        "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif",
        "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif"
    ];

    gifs.forEach(url => {
        const button = document.createElement("button");
        button.type = "button";
        const image = document.createElement("img");
        image.src = url;
        image.alt = "GIF";
        button.appendChild(image);
        button.onclick = async () => {
            await postMessage({ type: "gif", data: url, text: "" });
            emojiPicker.classList.add("hidden");
        };
        gifGrid.appendChild(button);
    });
}

function loadStickers() {
    stickerGrid.innerHTML = "";
    ["😀","😂","😍","🥰","😎","🤩","🥳","❤️","🔥","💯","👍","👏","🙏","👑","⭐"]
        .forEach(sticker => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = sticker;
            button.onclick = async () => {
                await postMessage({ text: sticker });
                emojiPicker.classList.add("hidden");
            };
            stickerGrid.appendChild(button);
        });
}

function groupMemberAllowed(group, permissionKey) {
    if (!group || !currentUser) return false;
    const admins = Array.isArray(group.admins) && group.admins.length ? group.admins : [group.ownerId];
    if (admins.includes(currentUser.uid) || isAdmin()) return true;
    return (group.settings?.[permissionKey] || "all") === "all";
}

function renderCreateGroupMembers() {
    if (!groupMembers) return;
    const term = (groupMemberSearch?.value || "").trim().toLowerCase();
    groupMembers.innerHTML = "";
    const users = visibleUsers().filter(user => !term || (user.name || user.email || "").toLowerCase().includes(term));
    users.forEach(user => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "group-member-picker-row" + (groupCreateSelected.has(user.uid) ? " selected" : "");
        row.innerHTML = `<div class="avatar">${avatarHTML(user)}</div><div class="group-member-meta"><strong>${escapeHTML(user.name || user.email)}</strong><small>${escapeHTML(user.bio || user.email || "")}</small></div><span class="group-check">${groupCreateSelected.has(user.uid) ? "✓" : ""}</span>`;
        row.addEventListener("click", () => {
            if (groupCreateSelected.has(user.uid)) groupCreateSelected.delete(user.uid); else groupCreateSelected.add(user.uid);
            renderCreateGroupMembers();
            renderSelectedCreateMembers();
        });
        groupMembers.appendChild(row);
    });
    if (!users.length) groupMembers.innerHTML = `<div class="group-empty">No people found.</div>`;
}

function renderSelectedCreateMembers() {
    selectedGroupMembers.innerHTML = "";
    [...groupCreateSelected].forEach(uid => {
        const user = allUsers.find(u => u.uid === uid); if (!user) return;
        const chip = document.createElement("button"); chip.type = "button"; chip.className = "member-chip";
        chip.innerHTML = `<span class="mini-avatar">${avatarHTML(user)}</span><span>${escapeHTML(user.name || user.email)}</span><b>×</b>`;
        chip.addEventListener("click", () => { groupCreateSelected.delete(uid); renderSelectedCreateMembers(); renderCreateGroupMembers(); });
        selectedGroupMembers.appendChild(chip);
    });
    const count = groupCreateSelected.size;
    groupCreateCount.textContent = `${count} participant${count === 1 ? "" : "s"} selected`;
    groupCreateHint.textContent = count ? "Ready to create your group" : "Choose at least one participant";
    createGroupBtn.disabled = count === 0;
}

function loadGroupMembers() {
    groupCreateSelected = new Set(); pendingGroupPhoto = "";
    if (groupMemberSearch) groupMemberSearch.value = "";
    if (groupAbout) groupAbout.value = "";
    if (groupPhotoPreview) groupPhotoPreview.textContent = "📷";
    renderCreateGroupMembers(); renderSelectedCreateMembers();
}

groupMemberSearch?.addEventListener("input", renderCreateGroupMembers);
groupPhotoInput?.addEventListener("change", async () => {
    const file = groupPhotoInput.files?.[0]; if (!file) return;
    try { pendingGroupPhoto = await compressProfileImage(file); groupPhotoPreview.innerHTML = `<img src="${escapeHTML(pendingGroupPhoto)}" alt="Group photo">`; }
    catch { showToast("Could not use that group photo."); }
});

createGroupBtn?.addEventListener("click", async () => {
    const name = groupName.value.trim();
    if (!name) return showToast("Enter a group subject.");
    if (!groupCreateSelected.size) return showToast("Select at least one participant.");
    const members = [...new Set([currentUser.uid, ...groupCreateSelected])];
    createGroupBtn.disabled = true;
    try {
        const groupRef = await addDoc(collection(db, "groups"), {
            name, about: groupAbout?.value.trim() || "", photoURL: pendingGroupPhoto || "",
            ownerId: currentUser.uid, admins: [currentUser.uid], members,
            settings: { editInfo: "all", sendMessages: "all", addMembers: "all" },
            lastMessage: `${currentProfile.name} created the group.`, lastMessageAt: serverTimestamp(), createdAt: serverTimestamp()
        });
        await addDoc(collection(db, "groups", groupRef.id, "messages"), { text: `${currentProfile.name} created the group.`, senderId: currentUser.uid, system: true, createdAt: serverTimestamp() });
        groupPanel.classList.add("hidden"); groupName.value = ""; groupCreateSelected.clear(); setSidebarTab("groups");
        await openGroup({ id: groupRef.id, name, about: groupAbout?.value.trim() || "", photoURL: pendingGroupPhoto || "", members, admins:[currentUser.uid], ownerId:currentUser.uid, settings:{editInfo:"all",sendMessages:"all",addMembers:"all"} });
    } catch (error) { showToast(`Could not create group: ${friendlyError(error)}`); }
    finally { createGroupBtn.disabled = false; }
});

function groupAdmins(group = selectedGroup) { return new Set((group?.admins?.length ? group.admins : [group?.ownerId]).filter(Boolean)); }
function isGroupAdmin(group = selectedGroup, uid = currentUser?.uid) { return groupAdmins(group).has(uid) || isAdmin(); }

function openGroupInfo() {
    if (!selectedGroup) return;
    groupInfoName.textContent = selectedGroup.name || "Group";
    groupInfoAbout.textContent = selectedGroup.about || "No group description.";
    groupInfoCount.textContent = `${(selectedGroup.members || []).length} participants`;
    groupParticipantsTitle.textContent = `${(selectedGroup.members || []).length} participants`;
    if (selectedGroup.photoURL) groupInfoAvatar.innerHTML = `<img src="${escapeHTML(selectedGroup.photoURL)}" alt="">`; else groupInfoAvatar.textContent = getInitial(selectedGroup.name);
    groupEditPermission.value = selectedGroup.settings?.editInfo || "all";
    groupSendPermission.value = selectedGroup.settings?.sendMessages || "all";
    groupAddPermission.value = selectedGroup.settings?.addMembers || "all";
    const canManage = isGroupAdmin();
    saveGroupSettingsBtn.classList.toggle("hidden", !canManage);
    groupEditPermission.disabled = groupSendPermission.disabled = groupAddPermission.disabled = !canManage;
    editGroupInfoBtn.classList.toggle("hidden", !groupMemberAllowed(selectedGroup, "editInfo"));
    addGroupMembersBtn.classList.toggle("hidden", !groupMemberAllowed(selectedGroup, "addMembers"));
    renderGroupParticipants(); groupInfoPanel.classList.remove("hidden");
}

function renderGroupParticipants() {
    if (!selectedGroup) return;
    const term = (groupParticipantSearch?.value || "").trim().toLowerCase();
    const admins = groupAdmins(); groupParticipantsList.innerHTML = "";
    const people = (selectedGroup.members || []).map(uid => uid === currentUser.uid ? { uid, name: currentProfile?.name, email: currentUser.email, photoURL:currentProfile?.photoURL } : allUsers.find(u => u.uid === uid)).filter(Boolean)
        .filter(u => !term || (u.name || u.email || "").toLowerCase().includes(term));
    people.sort((a,b) => (admins.has(b.uid)-admins.has(a.uid)) || (a.name||"").localeCompare(b.name||""));
    people.forEach(user => {
        const row = document.createElement("div"); row.className = "group-participant-row";
        const self = user.uid === currentUser.uid; const adminBadge = admins.has(user.uid) ? '<span class="group-admin-badge">Group admin</span>' : "";
        let actions = "";
        if (isGroupAdmin() && !self) actions = `<button data-promote="${user.uid}" class="mini-action">${admins.has(user.uid) ? "Dismiss admin" : "Make admin"}</button><button data-remove-member="${user.uid}" class="mini-action danger">Remove</button>`;
        row.innerHTML = `<div class="avatar">${avatarHTML(user)}</div><div class="group-member-meta"><strong>${escapeHTML(self ? "You" : (user.name || user.email))}</strong><small>${escapeHTML(user.bio || user.email || "")}</small>${adminBadge}</div><div class="participant-actions">${actions}</div>`;
        groupParticipantsList.appendChild(row);
    });
    groupParticipantsList.querySelectorAll("[data-promote]").forEach(btn => btn.addEventListener("click", async () => {
        const uid = btn.dataset.promote; const admins = [...groupAdmins()]; const has = admins.includes(uid); const next = has ? admins.filter(x=>x!==uid) : [...admins,uid];
        if (!next.length) return showToast("A group must have at least one admin.");
        await updateDoc(doc(db,"groups",selectedGroup.id), { admins: next }); showToast(has ? "Admin removed." : "Group admin added.");
    }));
    groupParticipantsList.querySelectorAll("[data-remove-member]").forEach(btn => btn.addEventListener("click", async () => {
        const uid = btn.dataset.removeMember; const user = allUsers.find(u=>u.uid===uid); if (!confirm(`Remove ${user?.name || "this participant"} from the group?`)) return;
        const members=(selectedGroup.members||[]).filter(x=>x!==uid), admins=[...groupAdmins()].filter(x=>x!==uid);
        await updateDoc(doc(db,"groups",selectedGroup.id), { members, admins: admins.length?admins:[currentUser.uid] });
        await addDoc(collection(db,"groups",selectedGroup.id,"messages"), { senderId:currentUser.uid, system:true, text:`${currentProfile.name} removed ${user?.name || "a participant"}.`, createdAt:serverTimestamp() });
    }));
}

groupParticipantSearch?.addEventListener("input", renderGroupParticipants);
closeGroupInfoBtn?.addEventListener("click", () => groupInfoPanel.classList.add("hidden"));

saveGroupSettingsBtn?.addEventListener("click", async () => {
    if (!selectedGroup || !isGroupAdmin()) return;
    try { await updateDoc(doc(db,"groups",selectedGroup.id), { settings:{ editInfo:groupEditPermission.value, sendMessages:groupSendPermission.value, addMembers:groupAddPermission.value } }); showToast("Group settings saved."); }
    catch(error){ showToast(friendlyError(error)); }
});

editGroupInfoBtn?.addEventListener("click", async () => {
    if (!selectedGroup || !groupMemberAllowed(selectedGroup,"editInfo")) return;
    const name = prompt("Group subject", selectedGroup.name || ""); if (name === null) return;
    const about = prompt("Group description", selectedGroup.about || ""); if (about === null) return;
    if (!name.trim()) return showToast("Group subject cannot be empty.");
    await updateDoc(doc(db,"groups",selectedGroup.id), { name:name.trim(), about:about.trim() }); showToast("Group info updated.");
});

function renderAddMemberPicker() {
    if (!selectedGroup) return;
    const term=(groupAddSearch?.value||"").trim().toLowerCase(); groupAddMembersList.innerHTML="";
    const existing=new Set(selectedGroup.members||[]);
    visibleUsers().filter(u=>!existing.has(u.uid)).filter(u=>!term||(u.name||u.email||"").toLowerCase().includes(term)).forEach(user=>{
        const row=document.createElement("button"); row.type="button"; row.className="group-member-picker-row"+(groupAddSelected.has(user.uid)?" selected":"");
        row.innerHTML=`<div class="avatar">${avatarHTML(user)}</div><div class="group-member-meta"><strong>${escapeHTML(user.name||user.email)}</strong><small>${escapeHTML(user.bio||user.email||"")}</small></div><span class="group-check">${groupAddSelected.has(user.uid)?"✓":""}</span>`;
        row.onclick=()=>{groupAddSelected.has(user.uid)?groupAddSelected.delete(user.uid):groupAddSelected.add(user.uid);renderAddMemberPicker();renderSelectedAddMembers();}; groupAddMembersList.appendChild(row);
    });
}
function renderSelectedAddMembers(){selectedAddMembers.innerHTML="";[...groupAddSelected].forEach(uid=>{const u=allUsers.find(x=>x.uid===uid);if(!u)return;const b=document.createElement("button");b.type="button";b.className="member-chip";b.innerHTML=`<span class="mini-avatar">${avatarHTML(u)}</span><span>${escapeHTML(u.name||u.email)}</span><b>×</b>`;b.onclick=()=>{groupAddSelected.delete(uid);renderSelectedAddMembers();renderAddMemberPicker()};selectedAddMembers.appendChild(b)});groupAddCount.textContent=`${groupAddSelected.size} selected`;confirmAddMembersBtn.disabled=!groupAddSelected.size;}
addGroupMembersBtn?.addEventListener("click",()=>{if(!selectedGroup||!groupMemberAllowed(selectedGroup,"addMembers"))return;groupAddSelected=new Set();groupAddSearch.value="";renderAddMemberPicker();renderSelectedAddMembers();groupAddMembersPanel.classList.remove("hidden")});
closeGroupAddMembersBtn?.addEventListener("click",()=>groupAddMembersPanel.classList.add("hidden"));groupAddSearch?.addEventListener("input",renderAddMemberPicker);
confirmAddMembersBtn?.addEventListener("click",async()=>{if(!selectedGroup||!groupAddSelected.size)return;try{const names=[];const members=[...new Set([...(selectedGroup.members||[]),...groupAddSelected])];[...groupAddSelected].forEach(uid=>{const u=allUsers.find(x=>x.uid===uid);if(u)names.push(u.name||u.email)});await updateDoc(doc(db,"groups",selectedGroup.id),{members});await addDoc(collection(db,"groups",selectedGroup.id,"messages"),{senderId:currentUser.uid,system:true,text:`${currentProfile.name} added ${names.join(", ")}.`,createdAt:serverTimestamp()});groupAddMembersPanel.classList.add("hidden");showToast("Participants added.");}catch(e){showToast(friendlyError(e))}});
leaveGroupBtn?.addEventListener("click",async()=>{if(!selectedGroup)return;if(!confirm(`Exit ${selectedGroup.name}?`))return;const admins=[...groupAdmins()];if(admins.includes(currentUser.uid)&&admins.length===1&&(selectedGroup.members||[]).length>1)return showToast("Make another participant a group admin before leaving.");try{const id=selectedGroup.id;await updateDoc(doc(db,"groups",id),{members:(selectedGroup.members||[]).filter(x=>x!==currentUser.uid),admins:admins.filter(x=>x!==currentUser.uid)});groupInfoPanel.classList.add("hidden");backToChats();showToast("You left the group.");}catch(e){showToast(friendlyError(e))}});

settingsBtn?.addEventListener("click", () => {
    settingsName.value = currentProfile.name;
    notifyToggle.checked = notificationsEnabled();
    settingsPanel.classList.remove("hidden");
});

saveSettings?.addEventListener("click", async () => {
    const name = settingsName.value.trim();
    if (!name) return;

    await updateDoc(doc(db, "users", currentUser.uid), { name });
    currentProfile.name = name;
    myName.textContent = name + (isAdmin() ? " 👑 Admin" : "");
    myAvatar.textContent = getInitial(name);

    applyTheme(themeSelect.value);
    localStorage.setItem(NOTIFY_KEY, notifyToggle.checked ? "1" : "0");
    if (notifyToggle.checked && Notification.permission === "default") {
        await Notification.requestPermission();
    }

    settingsPanel.classList.add("hidden");
});

themeSelect?.addEventListener("change", () => applyTheme(themeSelect.value));

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => {
        $(button.dataset.close)?.classList.add("hidden");
    });
});

audioCallBtn?.addEventListener("click", () => startCall("audio"));
videoCallBtn?.addEventListener("click", () => startCall("video"));

async function startCall(type) {
    if (selectedUser && isBlockedByMe(selectedUser)) {
        showToast("You blocked this contact. Unblock them to call.");
        return;
    }
    if (!selectedUser) {
        alert("Select a person first.");
        return;
    }
    if (peerConnection) return;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === "video"
        });

        if (type === "video") localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = event => {
            if (type === "video") remoteVideo.srcObject = event.streams[0];
            else remoteAudio.srcObject = event.streams[0];
        };

        currentCallChatId = chatIdFor(currentUser.uid, selectedUser.uid);
        currentCallType = type;

        await setDoc(doc(db, "chats", currentCallChatId), {
            participants: [currentUser.uid, selectedUser.uid].sort()
        }, { merge: true });

        const callRef = await addDoc(collection(db, "chats", currentCallChatId, "calls"), {
            callerId: currentUser.uid,
            receiverId: selectedUser.uid,
            type,
            status: "ringing",
            createdAt: serverTimestamp()
        });

        currentCallId = callRef.id;

        peerConnection.onicecandidate = async event => {
            if (!event.candidate) return;
            await addDoc(
                collection(db, "chats", currentCallChatId, "calls", currentCallId, "candidates"),
                { senderId: currentUser.uid, candidate: event.candidate.toJSON() }
            );
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await updateDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

        showCallWindow(type, selectedUser.name);
        watchCall(callRef);
    } catch (error) {
        console.error(error);
        alert("Camera/microphone permission is required.");
        await stopCall(false);
    }
}

function showCallWindow(type, name) {
    callTitle.textContent = `${type === "video" ? "📹" : "📞"} ${name}`;
    callState.textContent = "Calling...";
    callWindow.classList.remove("hidden");
}

function watchCall(callRef) {
    clearUnsub(unsubscribeCalls);
    unsubscribeCalls = onSnapshot(callRef, async snap => {
        if (!snap.exists()) {
            await stopCall(false);
            return;
        }
        const data = snap.data();
        if (data.status === "ended" || data.status === "rejected") {
            await stopCall(false);
            return;
        }
        if (data.answer && peerConnection && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(data.answer);
            callState.textContent = "Connected";
        }
        listenCandidates(currentCallChatId, currentCallId);
    });
}

async function listenCandidates(chatId, callId) {
    const q = query(
        collection(db, "chats", chatId, "calls", callId, "candidates"),
        where("senderId", "!=", currentUser.uid)
    );

    extraUnsubs.push(onSnapshot(q, snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type !== "added") return;
            try {
                await peerConnection?.addIceCandidate(
                    new RTCIceCandidate(change.doc.data().candidate)
                );
            } catch { /* ignore */ }
        });
    }));
}

// Start listening for calls in ONE chat (called once per chat by listenInbox).
function watchCallsForChat(chatId) {
    if (watchedCallChats.has(chatId)) return;
    watchedCallChats.add(chatId);

    extraUnsubs.push(onSnapshot(collection(db, "chats", chatId, "calls"), calls => {
        calls.docChanges().forEach(change => {
            if (change.type !== "added") return;
            const data = change.doc.data();

            // Ignore calls that are old (a ringing call left over from earlier).
            const createdMs = data.createdAt?.toMillis?.();
            if (createdMs && Date.now() - createdMs > 90000) return;

            if (
                data.receiverId !== currentUser.uid ||
                data.status !== "ringing" ||
                data.callerId === currentUser.uid ||
                myBlockedAt[data.callerId] ||
                currentCallId === change.doc.id
            ) {
                return;
            }
            showIncomingCall(chatId, change.doc.id, data);
        });
    }, error => handleListenError("calls", error)));
}

function showIncomingCall(chatId, callId, data) {
    incomingCallData = { chatId, callId, data };
    incomingTitle.textContent = data.type === "video"
        ? "📹 Incoming video call"
        : "📞 Incoming audio call";
    incomingCall.classList.remove("hidden");
}

acceptCallBtn?.addEventListener("click", acceptIncomingCall);

async function acceptIncomingCall() {
    if (!incomingCallData) return;
    const { chatId, callId, data } = incomingCallData;
    incomingCall.classList.add("hidden");

    try {
        currentCallChatId = chatId;
        currentCallId = callId;
        currentCallType = data.type;

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: data.type === "video"
        });

        if (data.type === "video") localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = event => {
            if (data.type === "video") remoteVideo.srcObject = event.streams[0];
            else remoteAudio.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = async event => {
            if (!event.candidate) return;
            await addDoc(
                collection(db, "chats", chatId, "calls", callId, "candidates"),
                { senderId: currentUser.uid, candidate: event.candidate.toJSON() }
            );
        };

        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await updateDoc(doc(db, "chats", chatId, "calls", callId), {
            answer: { type: answer.type, sdp: answer.sdp },
            status: "connected"
        });

        showCallWindow(data.type, "Call");
        callState.textContent = "Connected";
        listenCandidates(chatId, callId);
    } catch (error) {
        console.error(error);
        alert("Could not answer the call.");
        await rejectIncomingCall();
    }
}

rejectCallBtn?.addEventListener("click", rejectIncomingCall);

async function rejectIncomingCall() {
    if (!incomingCallData) return;
    try {
        await updateDoc(
            doc(db, "chats", incomingCallData.chatId, "calls", incomingCallData.callId),
            { status: "rejected" }
        );
    } catch { /* ignore */ }
    incomingCallData = null;
    incomingCall.classList.add("hidden");
}

muteCallBtn?.addEventListener("click", () => {
    const track = localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    muteCallBtn.textContent = track.enabled ? "🎤" : "🔇";
});

cameraCallBtn?.addEventListener("click", () => {
    const track = localStream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    cameraCallBtn.textContent = track.enabled ? "📷" : "🚫";
});

endCallBtn?.addEventListener("click", () => stopCall(true));

async function stopCall(updateFirebase = true) {
    try {
        if (updateFirebase && currentCallChatId && currentCallId) {
            await updateDoc(doc(db, "chats", currentCallChatId, "calls", currentCallId), {
                status: "ended"
            });
        }
    } catch { /* ignore */ }

    localStream?.getTracks().forEach(track => track.stop());
    localStream = null;

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    remoteAudio.srcObject = null;
    callWindow.classList.add("hidden");
    currentCallId = currentCallChatId = currentCallType = null;
}

adminPanelBtn?.addEventListener("click", async () => {
    if (!isAdmin()) return;
    adminPanel.classList.remove("hidden");
    await loadAdminPanel();
});

// Asks the Netlify function to delete the login + profile for good.
// "ok"          -> deleted
// "unavailable" -> the function is not deployed / configured yet
// throws        -> the server refused (not allowed, protected account, ...)
async function callDeleteUserFunction(uid) {
    let response;
    try {
        const token = await currentUser.getIdToken();
        response = await fetch("/.netlify/functions/delete-user", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uid })
        });
    } catch {
        return "unavailable";
    }
    if (response.ok) return "ok";
    if (response.status === 400 || response.status === 403) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Not allowed.");
    }
    return "unavailable";
}

async function removeUserAccount(user, { declined = false } = {}) {
    const label = user.name || user.email || "this user";

    if (user.uid === currentUser.uid || isSuperAdmin(user)) {
        showToast("This account cannot be removed.");
        return;
    }
    if (user.admin && !isSuperAdmin(currentUser)) {
        showToast("Only a super admin can remove another admin.");
        return;
    }

    const question = declined
        ? `Reject ${label}'s request to join?`
        : `Remove ${label}?\n\nTheir account is deleted and they are signed out. Their old chat messages stay for the other person.`;
    if (!confirm(question)) return;

    try {
        const result = await callDeleteUserFunction(user.uid);
        if (result === "unavailable") {
            // The server function is not set up yet: hide and sign out the
            // account instead. The login itself stays until it is deployed.
            await updateDoc(doc(db, "users", user.uid), {
                removed: true,
                removedAt: serverTimestamp(),
                removedBy: currentUser.uid,
                admin: false,
                status: "offline"
            });
            showToast(`${label} was removed from the app. (Deleting the login needs the Netlify function — see SETUP.md.)`);
        } else {
            showToast(`${label} was deleted.`);
        }
        if (selectedUser?.uid === user.uid) backToChats();
    } catch (error) {
        console.error("Remove user failed:", error);
        showToast(`Could not remove: ${error.message || friendlyError(error)}`);
    }
    await loadAdminPanel();
}

function adminUserHeader(user, extraBadge = "") {
    return `
        <div class="admin-user-info">
            <strong>${escapeHTML(user.name || "User")}</strong>${extraBadge}
            <small>${escapeHTML(user.email || "")}</small>
        </div>`;
}

async function loadAdminPanel() {
    if (!isAdmin()) return;

    let snap;
    try {
        snap = await getDocs(collection(db, "users"));
    } catch (error) {
        showToast(`Could not load users: ${friendlyError(error)}`);
        return;
    }
    const everyone = snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
    const pending = everyone.filter(u => u.approved === false && !u.removed);
    const removed = everyone.filter(u => u.removed);
    const users = everyone.filter(u => !u.removed && u.approved !== false);

    // Passwords: super admins only.
    const secrets = {};
    const superView = isSuperAdmin(currentUser);
    // Passwords are intentionally never available in the admin panel.

    totalUsers.textContent = users.length;
    onlineUsers.textContent = users.filter(isOnline).length;
    blockedUsers.textContent = users.filter(u => u.blocked).length;

    adminUsersList.innerHTML = "";
    const pendingBox = $("pendingRequests");
    if (pendingBox) {
        pendingBox.innerHTML = "";
        pendingBox.classList.toggle("hidden", !pending.length);
        if (pending.length) {
            pendingBox.insertAdjacentHTML("beforeend", `<h3 class="admin-section-title">Join requests (${pending.length})</h3>`);
            pending.forEach(user => {
                const div = document.createElement("div");
                div.className = "admin-user pending";
                div.innerHTML = `
                    <div class="avatar">${avatarHTML(user)}</div>
                    ${adminUserHeader(user)}
                    <div class="admin-user-actions">
                        <button class="accept-btn" data-accept="${user.uid}" type="button">Accept</button>
                        <button class="danger-btn" data-reject="${user.uid}" type="button">Reject</button>
                    </div>`;
                pendingBox.appendChild(div);
            });
        }
    }

    users.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    users.forEach(user => {
        const div = document.createElement("div");
        div.className = "admin-user";

        const superRow = isSuperAdmin(user);
        const userIsAdmin = superRow || Boolean(user.admin);
        // Only a super admin may change an account that is already an admin.
        const canManage = !superRow && user.uid !== currentUser.uid &&
            (!userIsAdmin || isSuperAdmin(currentUser));

        let actions = "";
        if (superRow) {
            actions = `<span class="admin-fixed-badge">👑 Super Admin</span>`;
        } else if (canManage) {
            actions = `
                <button data-toggle-admin="${user.uid}" data-currently-admin="${userIsAdmin ? "1" : "0"}" type="button">
                    ${userIsAdmin ? "Remove Admin" : "Make Admin"}
                </button>
                <button data-block="${user.uid}" type="button" title="Stops this person from sending messages">
                    ${user.blocked ? "Unsuspend" : "Suspend"}
                </button>
                <button data-remove="${user.uid}" type="button" class="danger-btn">Remove</button>`;
        }


        const badges =
            (userIsAdmin && !superRow ? '<span class="admin-badge">👑 Admin</span>' : "") +
            (user.blocked ? '<span class="removed-badge">Suspended</span>' : "");

        div.innerHTML = `
            <div class="avatar">${avatarHTML(user)}</div>
            <div class="admin-user-info">
                <strong>${escapeHTML(user.name || "User")}</strong>${badges}
                <small>${escapeHTML(user.email || "")}</small>
            </div>
            <div class="admin-user-actions">${actions}</div>
        `;
        adminUsersList.appendChild(div);
    });

    if (removed.length) {
        adminUsersList.insertAdjacentHTML("beforeend", `<h3 class="admin-section-title">Removed accounts (${removed.length})</h3>`);
        removed.forEach(user => {
            const div = document.createElement("div");
            div.className = "admin-user removed";
            div.innerHTML = `
                <div class="avatar">${avatarHTML(user)}</div>
                ${adminUserHeader(user)}
                <div class="admin-user-actions"><button data-restore="${user.uid}" type="button">Restore</button></div>`;
            adminUsersList.appendChild(div);
        });
    }

    const byUid = uid => everyone.find(u => u.uid === uid);
    const panel = adminPanel;

    panel.querySelectorAll("[data-accept]").forEach(button => {
        button.addEventListener("click", async () => {
            const user = byUid(button.dataset.accept);
            try {
                await updateDoc(doc(db, "users", button.dataset.accept), {
                    approved: true,
                    approvedAt: serverTimestamp(),
                    approvedBy: currentUser.uid
                });
                showToast(`${user?.name || "User"} can now use PD Chat.`);
            } catch (error) {
                showToast(friendlyError(error));
            }
            await loadAdminPanel();
        });
    });

    panel.querySelectorAll("[data-reject]").forEach(button => {
        button.addEventListener("click", () => {
            const user = byUid(button.dataset.reject);
            if (user) removeUserAccount(user, { declined: true });
        });
    });

    panel.querySelectorAll("[data-block]").forEach(button => {
        button.addEventListener("click", async () => {
            const user = byUid(button.dataset.block);
            if (!user) return;
            try {
                await updateDoc(doc(db, "users", user.uid), { blocked: !user.blocked });
            } catch (error) {
                showToast(friendlyError(error));
            }
            await loadAdminPanel();
        });
    });

    panel.querySelectorAll("[data-toggle-admin]").forEach(button => {
        button.addEventListener("click", async () => {
            const uid = button.dataset.toggleAdmin;
            const currentlyAdmin = button.dataset.currentlyAdmin === "1";
            try {
                await updateDoc(doc(db, "users", uid), { admin: !currentlyAdmin });
            } catch (error) {
                showToast(friendlyError(error));
            }
            await loadAdminPanel();
        });
    });

    panel.querySelectorAll("[data-remove]").forEach(button => {
        button.addEventListener("click", () => {
            const user = byUid(button.dataset.remove);
            if (user) removeUserAccount(user);
        });
    });

    panel.querySelectorAll("[data-restore]").forEach(button => {
        button.addEventListener("click", async () => {
            try {
                await updateDoc(doc(db, "users", button.dataset.restore), {
                    removed: false,
                    blocked: false,
                    removedAt: deleteField(),
                    removedBy: deleteField()
                });
                showToast("Account restored.");
            } catch (error) {
                showToast(friendlyError(error));
            }
            await loadAdminPanel();
        });
    });

    panel.querySelectorAll("[data-pw-toggle]").forEach(button => {
        button.addEventListener("click", () => {
            const row = button.closest(".admin-password-row");
            row.querySelector("[data-pw-masked]").classList.toggle("hidden");
            row.querySelector("[data-pw-plain]").classList.toggle("hidden");
        });
    });
}

document.addEventListener("click", event => {
    if (emojiPicker && !emojiPicker.contains(event.target) && event.target !== emojiBtn) {
        emojiPicker.classList.add("hidden");
    }
    if (!event.target.closest(".message")) {
        document.querySelectorAll(".message-menu").forEach(x => x.remove());
    }
});

window.addEventListener("beforeunload", () => {
    if (currentUser) {
        updateDoc(doc(db, "users", currentUser.uid), {
            status: "offline",
            lastSeen: serverTimestamp()
        }).catch(() => {});
    }
    localStream?.getTracks().forEach(track => track.stop());
});

applyTheme(localStorage.getItem(THEME_KEY) || "light");
notifyToggle.checked = notificationsEnabled();

console.log("PD Chat loaded.");
// ============================================================
// PD CHAT - PROFILE SYSTEM
// ============================================================

const profilePanel = document.getElementById("profilePanel");
const myProfileBtn = document.getElementById("myProfileBtn");
const closeProfileBtn = document.getElementById("closeProfileBtn");

const profileAvatarPreview =
    document.getElementById("profileAvatarPreview");

const changePhotoBtn =
    document.getElementById("change-photo-btn");

const profileImageInput =
    document.getElementById("profileImageInput");

const profileName =
    document.getElementById("profileName");

const profileBio =
    document.getElementById("profileBio");

const profileEmail =
    document.getElementById("profileEmail");

const saveProfileBtn =
    document.getElementById("saveProfileBtn");

const userProfilePanel =
    document.getElementById("userProfilePanel");

const closeUserProfileBtn =
    document.getElementById("closeUserProfileBtn");

const publicProfileAvatar =
    document.getElementById("publicProfileAvatar");

const publicProfileName =
    document.getElementById("publicProfileName");

const publicProfileStatus =
    document.getElementById("publicProfileStatus");

const publicProfileBio =
    document.getElementById("publicProfileBio");

const publicProfileEmail =
    document.getElementById("publicProfileEmail");

const messageProfileBtn =
    document.getElementById("messageProfileBtn");


// ------------------------------------------------------------
// GET INITIALS
// ------------------------------------------------------------

function profileInitials(name) {

    const text = String(name || "User").trim();

    if (!text) return "?";

    const parts = text.split(/\s+/);

    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }

    return (
        parts[0][0] +
        parts[parts.length - 1][0]
    ).toUpperCase();
}


// ------------------------------------------------------------
// DISPLAY PROFILE PHOTO / INITIALS
// ------------------------------------------------------------

function displayProfileAvatar(element, profile) {

    if (!element) return;

    const name = profile?.name || "User";
    const photo = profile?.photoURL || "";

    element.innerHTML = "";

    if (photo) {

        const img = document.createElement("img");

        img.src = photo;
        img.alt = name;

        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.borderRadius = "50%";

        element.appendChild(img);

    } else {

        element.textContent = profileInitials(name);
    }
}


// ------------------------------------------------------------
// OPEN MY PROFILE
// ------------------------------------------------------------

function openMyProfile() {

    if (!currentUser) {
        alert("Please login first.");
        return;
    }

    if (!currentProfile) {

        currentProfile = {
            uid: currentUser.uid,
            name: currentUser.displayName || "",
            email: currentUser.email || "",
            bio: "",
            photoURL: ""
        };
    }

    if (profileName) {
        profileName.value =
            currentProfile.name ||
            currentUser.displayName ||
            "";
    }

    if (profileBio) {
        profileBio.value =
            currentProfile.bio || "";
    }

    if (profileEmail) {
        profileEmail.value =
            currentUser.email || "";
    }

    displayProfileAvatar(
        profileAvatarPreview,
        currentProfile
    );

    profilePanel?.classList.remove("hidden");
}


// ------------------------------------------------------------
// CLOSE MY PROFILE
// ------------------------------------------------------------

function closeMyProfile() {

    profilePanel?.classList.add("hidden");
}


// ------------------------------------------------------------
// PROFILE PHOTO PREVIEW
// ------------------------------------------------------------

changePhotoBtn?.addEventListener(
    "click",
    () => {

        profileImageInput?.click();

    }
);


profileImageInput?.addEventListener(
    "change",
    () => {

        const file =
            profileImageInput.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {

            alert("Please select an image.");

            profileImageInput.value = "";

            return;
        }

        const reader =
            new FileReader();

        reader.onload = function () {

            profileAvatarPreview.innerHTML = "";

            const img =
                document.createElement("img");

            img.src = reader.result;

            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            img.style.borderRadius = "50%";

            profileAvatarPreview.appendChild(img);
        };

        reader.readAsDataURL(file);
    }
);


// ------------------------------------------------------------
// SAVE PROFILE PHOTO AS COMPRESSED DATA
// ------------------------------------------------------------

function compressProfileImage(file) {

    return new Promise((resolve, reject) => {

        const reader =
            new FileReader();

        reader.onload = function () {

            const image =
                new Image();

            image.onload = function () {

                const maxSize = 500;

                let width = image.width;
                let height = image.height;

                if (width > height) {

                    if (width > maxSize) {

                        height =
                            height *
                            maxSize /
                            width;

                        width = maxSize;
                    }

                } else {

                    if (height > maxSize) {

                        width =
                            width *
                            maxSize /
                            height;

                        height = maxSize;
                    }
                }

                const canvas =
                    document.createElement("canvas");

                canvas.width =
                    Math.round(width);

                canvas.height =
                    Math.round(height);

                const ctx =
                    canvas.getContext("2d");

                ctx.drawImage(
                    image,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                const result =
                    canvas.toDataURL(
                        "image/jpeg",
                        0.75
                    );

                resolve(result);
            };

            image.onerror = reject;

            image.src = reader.result;
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}


// ------------------------------------------------------------
// SAVE PROFILE
// ------------------------------------------------------------

async function saveMyProfile() {

    if (!currentUser) {

        alert("Please login first.");

        return;
    }

    const name =
        profileName?.value.trim() || "";

    const bio =
        profileBio?.value.trim() || "";

    if (!name) {

        alert("Please enter your name.");

        return;
    }

    if (saveProfileBtn) {

        saveProfileBtn.disabled = true;
        saveProfileBtn.textContent = "Saving...";
    }

    try {

        let photoURL =
            currentProfile?.photoURL || "";

        const file =
            profileImageInput?.files?.[0];

        // ----------------------------------------------------
        // COMPRESS PHOTO
        // ----------------------------------------------------

        if (file) {

            if (!file.type.startsWith("image/")) {

                throw new Error(
                    "Please select a valid image."
                );
            }

            if (file.size > 10 * 1024 * 1024) {

                throw new Error(
                    "Image must be smaller than 10 MB."
                );
            }

            photoURL =
                await compressProfileImage(file);
        }

        // ----------------------------------------------------
        // FIRESTORE PROFILE
        // ----------------------------------------------------

        const profileData = {

            uid: currentUser.uid,

            name: name,

            email:
                currentUser.email || "",

            bio: bio,

            photoURL: photoURL,

            updatedAt:
                serverTimestamp()
        };


        await setDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            profileData,
            {
                merge: true
            }
        );


        // ----------------------------------------------------
        // UPDATE LOCAL PROFILE
        // ----------------------------------------------------

        currentProfile = {

            ...currentProfile,

            ...profileData,

            uid: currentUser.uid,

            email:
                currentUser.email || "",

            name: name,

            bio: bio,

            photoURL: photoURL
        };


        // ----------------------------------------------------
        // UPDATE MAIN PROFILE
        // ----------------------------------------------------

        if (myName) {

            myName.textContent =
                name;
        }

        if (myAvatar) {

            displayProfileAvatar(
                myAvatar,
                currentProfile
            );
        }

        if (profileAvatarPreview) {

            displayProfileAvatar(
                profileAvatarPreview,
                currentProfile
            );
        }


        // ----------------------------------------------------
        // UPDATE SIDEBAR
        // ----------------------------------------------------

        if (
            typeof renderSidebar === "function"
        ) {

            renderSidebar();
        }


        // ----------------------------------------------------
        // CLOSE PROFILE
        // ----------------------------------------------------

        profilePanel?.classList.add(
            "hidden"
        );


        if (profileImageInput) {

            profileImageInput.value = "";
        }


        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        alert(
            "Profile updated successfully!"
        );

    } catch (error) {

        console.error(
            "PROFILE SAVE ERROR:",
            error
        );

        alert(
            "Profile could not be saved.\n\n" +
            error.message
        );

    } finally {

        if (saveProfileBtn) {

            saveProfileBtn.disabled = false;

            saveProfileBtn.textContent =
                "Save Profile";
        }
    }
}


// ------------------------------------------------------------
// OPEN OTHER USER PROFILE
// ------------------------------------------------------------

async function openPublicProfile(user) {

    if (!user) return;

    publicProfileName.textContent =
        user.name ||
        user.email ||
        "User";

    publicProfileEmail.textContent =
        user.email ||
        "";

    publicProfileBio.textContent =
        user.bio ||
        "No bio added.";

    if (user.status === "online") {

        publicProfileStatus.textContent =
            "Online";

    } else if (user.status === "away") {

        publicProfileStatus.textContent =
            "Away";

    } else {

        publicProfileStatus.textContent =
            "Offline";
    }

    displayProfileAvatar(
        publicProfileAvatar,
        user
    );

    blockTargetUser = user;
    refreshBlockButton();

    userProfilePanel?.classList.remove(
        "hidden"
    );
}


// ------------------------------------------------------------
// CLOSE OTHER USER PROFILE
// ------------------------------------------------------------

closeUserProfileBtn?.addEventListener(
    "click",
    () => {

        userProfilePanel?.classList.add(
            "hidden"
        );
    }
);


// ------------------------------------------------------------
// PROFILE BUTTON
// ------------------------------------------------------------

myProfileBtn?.addEventListener(
    "click",
    openMyProfile
);


// ------------------------------------------------------------
// CLOSE PROFILE BUTTON
// ------------------------------------------------------------

closeProfileBtn?.addEventListener(
    "click",
    closeMyProfile
);


// ------------------------------------------------------------
// SAVE PROFILE BUTTON
// ------------------------------------------------------------

saveProfileBtn?.addEventListener(
    "click",
    saveMyProfile
);


// ------------------------------------------------------------
// ESCAPE KEY CLOSES PROFILE
// ------------------------------------------------------------

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") return;

        profilePanel?.classList.add(
            "hidden"
        );

        userProfilePanel?.classList.add(
            "hidden"
        );
    }
);


// ------------------------------------------------------------
// LOAD CURRENT PROFILE AGAIN FROM FIRESTORE
// ------------------------------------------------------------

async function reloadMyProfile() {

    if (!currentUser) return;

    try {

        const profileRef =
            doc(
                db,
                "users",
                currentUser.uid
            );

        const snapshot =
            await getDoc(profileRef);

        if (snapshot.exists()) {

            currentProfile = {

                ...snapshot.data(),

                uid:
                    currentUser.uid
            };

        } else {
            // A missing profile means the account was deleted. Never re-create it here.
            return;
        }

        if (myName) {

            myName.textContent =
                currentProfile.name ||
                "User";
        }

        displayProfileAvatar(
            myAvatar,
            currentProfile
        );

    } catch (error) {

        console.error(
            "PROFILE LOAD ERROR:",
            error
        );
    }
}


// ------------------------------------------------------------
// AUTOMATIC PROFILE LOAD
// ------------------------------------------------------------

if (typeof currentUser !== "undefined") {

    setTimeout(
        () => {

            if (currentUser) {

                reloadMyProfile();
            }

        },
        1000
    );
}


// ------------------------------------------------------------
// PD CHAT PROFILE SYSTEM LOADED
// ------------------------------------------------------------

console.log(
    "PD Chat profile system loaded."
);