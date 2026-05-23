const themeToggle = document.getElementById('themeToggle');
const adminToggle = document.getElementById('adminToggle');
const adminPanel = document.getElementById('adminPanel');
const adminLoginButton = document.getElementById('adminLoginButton');
const postFormContainer = document.getElementById('postFormContainer');
const addPostButton = document.getElementById('addPostButton');
const postsGrid = document.getElementById('postsGrid');
const aiToggle = document.getElementById('aiToggle');
const aiChatPanel = document.getElementById('aiChatPanel');
const aiClose = document.getElementById('aiClose');
const aiMessages = document.getElementById('aiMessages');
const aiInput = document.getElementById('aiInput');
const aiSendButton = document.getElementById('aiSendButton');
const aiFileInput = document.getElementById('aiFileInput');
const aiNote = document.getElementById('aiNote');
const syncStatus = document.getElementById('syncStatus');
const postHasPollCheckbox = document.getElementById('postHasPoll');
const pollFields = document.getElementById('pollFields');
const pollQuestionInput = document.getElementById('pollQuestion');
const pollOptionsContainer = document.getElementById('pollOptionsContainer');
const addPollOptionButton = document.getElementById('addPollOptionButton');
const pollMultipleChoicesCheckbox = document.getElementById('pollMultipleChoices');
const postMediaFileInput = document.getElementById('postMediaFile');
const deleteAllPostsButton = document.getElementById('deleteAllPostsButton');

const adminPassword = 'VAYDE3255'; // Mot de passe pour accéder au panneau admin (à changer pour plus de sécurité)
const API_KEY = "AIzaSyA6kCu45SIk89TkPqJw8dEgjLhySsLXqM0"
const POSTS_CACHE_KEY = 'vaydeSitePosts';
const LIKED_POSTS_CACHE_KEY = 'vaydeLikedPosts';
const USER_VOTES_CACHE_KEY = 'vaydeUserVotes';
const POSTS_NOTIFICATION_KEY = 'vaydePostNotifications';
const POSTS_COLLECTION_NAME = 'posts';
const MAX_POLL_OPTIONS = 5;

let isAdmin = localStorage.getItem('isAdmin') === 'true';
let posts = [];
let likedPosts = [];
let userVotes = {};
let editingPostId = null;
let contactEmail = '';
let contactName = '';

const OPENAI_API_KEY = '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';
const OPENAI_MODEL = 'gpt-3.5-turbo';
let initialPostLoadComplete = false;

let firestoreReady = false;
let db = null;
let postsCollection = null;

function updateSyncStatus(message, warning = false) {
  if (!syncStatus) return;
  syncStatus.textContent = message;
  syncStatus.style.borderColor = warning ? 'rgba(220, 38, 38, 0.35)' : 'rgba(15, 23, 42, 0.08)';
  syncStatus.style.background = warning
    ? 'rgba(254, 226, 226, 0.85)'
    : 'rgba(255, 255, 255, 0.85)';
  if (document.documentElement.classList.contains('dark')) {
    syncStatus.style.background = warning
      ? 'rgba(139, 11, 11, 0.60)'
      : 'rgba(17, 24, 39, 0.92)';
  }
}

function normalizeCreatedAt(createdAt) {
  if (!createdAt) return '';
  if (typeof createdAt === 'string') return createdAt;
  if (typeof createdAt === 'number') return new Date(createdAt).toISOString();
  if (createdAt.toDate) return createdAt.toDate().toISOString();
  if (createdAt.toMillis) return new Date(createdAt.toMillis()).toISOString();
  if (typeof createdAt.seconds === 'number') return new Date(createdAt.seconds * 1000).toISOString();
  return String(createdAt);
}

function normalizePostData(post) {
  return {
    id: String(post.id || ''),
    title: post.title || '',
    text: post.text || '',
    mediaType: post.mediaType || 'none',
    mediaUrl: post.mediaUrl || '',
    likes: typeof post.likes === 'number' ? post.likes : 0,
    pollQuestion: post.pollQuestion || '',
    pollOptions: Array.isArray(post.pollOptions)
      ? post.pollOptions.map(option => ({
          text: option.text || '',
          votes: typeof option.votes === 'number' ? option.votes : 0,
        }))
      : [],
    multipleChoices: typeof post.multipleChoices === 'boolean' ? post.multipleChoices : false,
    createdAt: normalizeCreatedAt(post.createdAt),
  };
}

function askPostNotificationsPermission() {
  if (!('Notification' in window)) return;
  const stored = localStorage.getItem(POSTS_NOTIFICATION_KEY);
  if (stored !== null) return;
  setTimeout(() => {
    const wantsNotifications = confirm('Veux-tu activer les notifications des posts de VAYDE sur ton appareil ?');
    if (!wantsNotifications) {
      localStorage.setItem(POSTS_NOTIFICATION_KEY, 'denied');
      return;
    }
    Notification.requestPermission().then(permission => {
      localStorage.setItem(POSTS_NOTIFICATION_KEY, permission);
      if (permission === 'granted') {
        setAiStatus('Notifications des posts activées.');
      } else {
        setAiStatus('Notifications des posts non autorisées.');
      }
    }).catch(error => {
      console.error('Notification permission error :', error);
      localStorage.setItem(POSTS_NOTIFICATION_KEY, 'denied');
    });
  }, 500);
}

function arePostNotificationsEnabled() {
  return ('Notification' in window)
    && Notification.permission === 'granted'
    && localStorage.getItem(POSTS_NOTIFICATION_KEY) === 'granted';
}

function notifyVaydePost(post) {
  if (!arePostNotificationsEnabled()) return;
  const title = post.title ? `Nouveau post de VAYDE : ${post.title}` : 'Nouveau post de VAYDE';
  const body = post.text ? (post.text.length > 80 ? `${post.text.slice(0, 77)}...` : post.text) : 'Un nouveau post vient d’être publié.';
  try {
    new Notification(title, {
      body,
      icon: '',
    });
  } catch (error) {
    console.error('Notification error :', error);
  }
}

function updateButtonText() {
  const isDark = document.documentElement.classList.contains('dark');
  themeToggle.textContent = isDark ? 'Mode clair' : 'Mode sombre';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadPosts() {
  try {
    const stored = localStorage.getItem(POSTS_CACHE_KEY);
    posts = stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Impossible de lire les posts locaux, réinitialisation.', error);
    posts = [];
  }
  posts = posts.map(normalizePostData);

  try {
    likedPosts = JSON.parse(localStorage.getItem(LIKED_POSTS_CACHE_KEY)) || [];
  } catch (error) {
    likedPosts = [];
  }
}

function savePosts() {
  localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(posts));
}

function loadVotedPolls() {
  try {
    userVotes = JSON.parse(localStorage.getItem(USER_VOTES_CACHE_KEY)) || {};
  } catch (error) {
    userVotes = {};
  }
}

function saveVotedPolls() {
  localStorage.setItem(USER_VOTES_CACHE_KEY, JSON.stringify(userVotes));
}

function saveLikedPosts() {
  localStorage.setItem(LIKED_POSTS_CACHE_KEY, JSON.stringify(likedPosts));
}

function checkFirestorePrerequisites() {
  if (window.location.protocol !== 'https:'
      && window.location.hostname !== 'localhost'
      && window.location.hostname !== '127.0.0.1') {
    updateSyncStatus('Firestore requiert HTTPS ou localhost. Ouvre cette page via un serveur local ou en HTTPS.', true);
    return false;
  }
  return true;
}

function initFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyC-bXkjux8eO176qnqMq8aqssi-nBMudT4",
    authDomain: "vayde-web-bb08b.firebaseapp.com",
    databaseURL: "https://vayde-web-bb08b-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "vayde-web-bb08b",
    storageBucket: "vayde-web-bb08b.firebasestorage.app",
    messagingSenderId: "466275486686",
    appId: "1:466275486686:web:19a0c2b915e4f72de62b4f",
    measurementId: "G-SR723DR4W7"
  };

  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    postsCollection = db.collection(POSTS_COLLECTION_NAME);
    firestoreReady = true;
    updateSyncStatus('Connexion Firestore établie. Les posts de l’admin seront synchronisés.', false);
    subscribePosts();
  } catch (error) {
    firestoreReady = false;
    console.warn('Firebase n\'a pas pu être initialisé :', error);
    updateSyncStatus('Impossible d’initialiser Firestore. Vérifie la console pour l’erreur.', true);
  }
}

function subscribePosts() {
  if (!firestoreReady || !postsCollection) return;

  postsCollection.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    const previousIds = new Set(posts.map(post => post.id));
    const newPosts = [];
    const remotePosts = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const post = normalizePostData({
        id: doc.id,
        title: data.title,
        text: data.text,
        mediaType: data.mediaType,
        mediaUrl: data.mediaUrl,
        likes: data.likes,
        pollQuestion: data.pollQuestion,
        pollOptions: data.pollOptions,
        multipleChoices: data.multipleChoices,
        createdAt: data.createdAt,
      });
      remotePosts.push(post);
      if (previousIds.size > 0 && !previousIds.has(post.id)) {
        newPosts.push(post);
      }
    });

    if (snapshot.empty && posts.length > 0 && !initialPostLoadComplete) {
      // Garde les posts locaux si Firestore est vide au démarrage,
      // pour éviter d'écraser des posts enregistrés localement.
      updateSyncStatus('Aucun post Firestore trouvé : affichage des posts locaux.', false);
      renderPosts();
      initialPostLoadComplete = true;
      return;
    }

    const remoteIds = new Set(remotePosts.map(post => post.id));
    const localUnsyncedPosts = posts.filter(post => !remoteIds.has(post.id));
    posts = [...remotePosts, ...localUnsyncedPosts];

    savePosts();
    renderPosts();

    if (initialPostLoadComplete) {
      newPosts.slice(0, 3).forEach(notifyVaydePost);
    }
    initialPostLoadComplete = true;
  }, error => {
    console.error('Erreur Firestore posts :', error);
    updateSyncStatus('Erreur Firestore : impossible de charger les posts.', true);
  });
}

function createVideoElement(url) {
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = 'auto';
  container.style.maxHeight = '500px';

  // YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else {
      videoId = url.split('v=')[1]?.split('&')[0] || '';
    }
    if (videoId) {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.width = '100%';
      wrapper.style.paddingBottom = '56.25%';
      wrapper.style.height = '0';
      wrapper.style.overflow = 'hidden';
      wrapper.style.backgroundColor = '#000';
      
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      iframe.style.position = 'absolute';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.setAttribute('loading', 'lazy');
      
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
      return container;
    }
  }

  // TikTok
  if (url.includes('tiktok.com')) {
    const videoId = url.split('/video/')[1]?.split('?')[0] || '';
    if (videoId) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'center';
      wrapper.style.width = '100%';
      
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.tiktok.com/embed/v2/${videoId}`;
      iframe.style.width = '100%';
      iframe.style.height = '600px';
      iframe.style.maxHeight = '600px';
      iframe.style.border = 'none';
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allow', 'autoplay; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('loading', 'lazy');
      
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
      return container;
    }
  }

  // Vimeo
  if (url.includes('vimeo.com')) {
    const videoId = url.split('/')[3] || '';
    if (videoId) {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.width = '100%';
      wrapper.style.paddingBottom = '56.25%';
      wrapper.style.height = '0';
      wrapper.style.overflow = 'hidden';
      
      const iframe = document.createElement('iframe');
      iframe.src = `https://player.vimeo.com/video/${videoId}`;
      iframe.style.position = 'absolute';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      iframe.setAttribute('loading', 'lazy');
      
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
      return container;
    }
  }

  // Vidéo directe (mp4, webm, etc)
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('preload', 'metadata');
  video.style.width = '100%';
  video.style.height = 'auto';
  video.style.maxHeight = '500px';
  video.style.objectFit = 'cover';
  container.appendChild(video);
  return container;
}

function renderPosts() {
  postsGrid.innerHTML = '';
  if (posts.length === 0) {
    postsGrid.innerHTML = '<p>Aucun post pour le moment. Connecte-toi en admin pour en créer.</p>';
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.id = `post-${post.id}`;

    if (post.mediaType === 'image' && post.mediaUrl) {
      const img = document.createElement('img');
      img.src = post.mediaUrl;
      img.alt = post.title;
      card.appendChild(img);
    }

    if (post.mediaType === 'video' && post.mediaUrl) {
      card.appendChild(createVideoElement(post.mediaUrl));
    }

    const content = document.createElement('div');
    content.className = 'post-card-content';

    const title = document.createElement('h3');
    title.textContent = post.title || 'Post sans titre';
    content.appendChild(title);

    const text = document.createElement('p');
    text.textContent = post.text || '';
    content.appendChild(text);

    // Actions like and share
    const actions = document.createElement('div');
    actions.className = 'post-actions';

    const likeBtn = document.createElement('button');
    likeBtn.className = 'like-btn';
    likeBtn.innerHTML = likedPosts.includes(post.id) ? '❤️' : '🖤';
    if (likedPosts.includes(post.id)) {
      likeBtn.classList.add('liked');
    }
    likeBtn.addEventListener('click', () => toggleLike(post.id));

    const likeCount = document.createElement('span');
    likeCount.className = 'like-count';
    likeCount.textContent = post.likes;

    actions.appendChild(likeBtn);
    actions.appendChild(likeCount);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'share-btn';
    shareBtn.innerHTML = '🔗';
    shareBtn.addEventListener('click', () => sharePost(post));

    actions.appendChild(shareBtn);

    content.appendChild(actions);

    renderPoll(post, content);

    // Ajouter les boutons admin si connecté
    if (isAdmin) {
      const adminActions = document.createElement('div');
      adminActions.className = 'post-admin-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'button button-small button-edit';
      editBtn.textContent = 'Modifier';
      editBtn.addEventListener('click', () => startEditPost(post.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'button button-small button-delete';
      deleteBtn.textContent = 'Supprimer';
      deleteBtn.addEventListener('click', () => deletePost(post.id));

      adminActions.appendChild(editBtn);
      adminActions.appendChild(deleteBtn);
      content.appendChild(adminActions);
    }

    card.appendChild(content);
    postsGrid.appendChild(card);
  });
}

function getUserVotesForPost(postId) {
  return userVotes[postId] || [];
}

function votePoll(postId, optionIndex) {
  const post = posts.find(p => p.id === postId);
  if (!post || !Array.isArray(post.pollOptions) || !post.pollOptions[optionIndex]) return;

  const userVotedOptions = getUserVotesForPost(postId);
  const isMultiple = post.multipleChoices;

  if (isMultiple) {
    // Multiple choices: toggle the option
    const indexInUserVotes = userVotedOptions.indexOf(optionIndex);
    if (indexInUserVotes > -1) {
      // Remove vote
      userVotedOptions.splice(indexInUserVotes, 1);
      post.pollOptions[optionIndex].votes = Math.max(0, (post.pollOptions[optionIndex].votes || 0) - 1);
    } else {
      // Add vote
      userVotedOptions.push(optionIndex);
      post.pollOptions[optionIndex].votes = (post.pollOptions[optionIndex].votes || 0) + 1;
    }
  } else {
    // Single choice: change to this option
    // Remove previous vote if any
    if (userVotedOptions.length > 0) {
      const prevOption = userVotedOptions[0];
      post.pollOptions[prevOption].votes = Math.max(0, (post.pollOptions[prevOption].votes || 0) - 1);
    }
    // Add new vote
    userVotedOptions.length = 0; // Clear
    userVotedOptions.push(optionIndex);
    post.pollOptions[optionIndex].votes = (post.pollOptions[optionIndex].votes || 0) + 1;
  }

  // Update userVotes
  if (userVotedOptions.length > 0) {
    userVotes[postId] = userVotedOptions;
  } else {
    delete userVotes[postId];
  }

  if (firestoreReady) {
    postsCollection.doc(postId).update({ pollOptions: post.pollOptions }).catch(error => {
      console.error('Erreur mise à jour sondage Firestore :', error);
    });
  }
  savePosts();
  saveVotedPolls();
  renderPosts();
}

function addOptionToPoll(postId) {
  const newOptionText = prompt('Entrez le texte de la nouvelle option:');
  if (!newOptionText || !newOptionText.trim()) return;

  const post = posts.find(p => p.id === postId);
  if (!post || !Array.isArray(post.pollOptions)) return;

  post.pollOptions.push({ text: newOptionText.trim(), votes: 0 });

  if (firestoreReady) {
    postsCollection.doc(postId).update({ pollOptions: post.pollOptions }).catch(error => {
      console.error('Erreur mise à jour sondage Firestore :', error);
    });
  }
  savePosts();
  renderPosts();
}

function removeOptionFromPoll(postId, optionIndex) {
  const post = posts.find(p => p.id === postId);
  if (!post || !Array.isArray(post.pollOptions)) return;
  
  if (post.pollOptions.length <= 2) {
    alert('Un sondage doit avoir au moins 2 options.');
    return;
  }
  
  post.pollOptions.splice(optionIndex, 1);
  
  // Recalculate user votes to remove deleted option
  if (userVotes[postId]) {
    userVotes[postId] = userVotes[postId].filter(idx => idx !== optionIndex);
  }

  if (firestoreReady) {
    postsCollection.doc(postId).update({ pollOptions: post.pollOptions }).catch(error => {
      console.error('Erreur mise à jour sondage Firestore :', error);
    });
  }
  savePosts();
  saveVotedPolls();
  renderPosts();
}

function renderPoll(post, content) {
  if (!post.pollQuestion || !Array.isArray(post.pollOptions) || post.pollOptions.length === 0) {
    return;
  }

  const pollSection = document.createElement('div');
  pollSection.className = 'poll-section';

  const question = document.createElement('p');
  question.className = 'poll-question';
  question.textContent = post.pollQuestion;
  pollSection.appendChild(question);

  const totalVotes = post.pollOptions.reduce((sum, option) => sum + (typeof option.votes === 'number' ? option.votes : 0), 0);
  const userVotedOptions = getUserVotesForPost(post.id);
  const isMultiple = post.multipleChoices;

  post.pollOptions.forEach((option, index) => {
    const optionWrapper = document.createElement('div');
    optionWrapper.className = 'poll-option';

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '0.5rem';
    buttonContainer.style.alignItems = 'center';

    const voteButton = document.createElement('button');
    voteButton.type = 'button';
    voteButton.className = 'poll-vote-btn button';
    voteButton.textContent = option.text || `Option ${index + 1}`;
    voteButton.style.flex = '1';
    if (userVotedOptions.includes(index)) {
      voteButton.classList.add('voted');
    }
    voteButton.addEventListener('click', () => votePoll(post.id, index));
    buttonContainer.appendChild(voteButton);

    if (isAdmin) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'button button-small button-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.style.padding = '0.5rem 0.75rem';
      deleteBtn.style.minWidth = 'auto';
      deleteBtn.addEventListener('click', () => removeOptionFromPoll(post.id, index));
      buttonContainer.appendChild(deleteBtn);
    }

    optionWrapper.appendChild(buttonContainer);

    const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
    const result = document.createElement('div');
    result.className = 'poll-result';
    result.innerHTML = `
      <div class="poll-result-label">${option.votes || 0} vote(s) · ${percent}%</div>
      <div class="poll-bar"><div class="poll-bar-fill" style="width:${percent}%;"></div></div>
    `;
    optionWrapper.appendChild(result);
    pollSection.appendChild(optionWrapper);
  });

  const hint = document.createElement('p');
  hint.className = 'poll-hint';
  if (isMultiple) {
    hint.textContent = 'Choisis une ou plusieurs options et vote.';
  } else {
    hint.textContent = 'Choisis ton option préférée et vote.';
  }
  pollSection.appendChild(hint);

  // Admin button to add options
  if (isAdmin) {
    const addOptionBtn = document.createElement('button');
    addOptionBtn.className = 'button button-secondary';
    addOptionBtn.textContent = 'Ajouter une option';
    addOptionBtn.addEventListener('click', () => addOptionToPoll(post.id));
    pollSection.appendChild(addOptionBtn);
  }

  content.appendChild(pollSection);
}

function addPollOptionInput(value = '') {
  const currentCount = pollOptionsContainer.querySelectorAll('.poll-option-input-wrapper').length;
  if (currentCount >= 5) {
    return;
  }
  
  const wrapper = document.createElement('div');
  wrapper.className = 'poll-option-input-wrapper';
  wrapper.style.display = 'flex';
  wrapper.style.gap = '0.5rem';
  wrapper.style.alignItems = 'center';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'poll-option-input';
  input.value = value;
  input.placeholder = `Option ${currentCount + 1}`;
  input.style.flex = '1';
  
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'button button-small button-delete';
  removeBtn.textContent = '✕';
  removeBtn.style.padding = '0.5rem 0.75rem';
  removeBtn.style.minWidth = 'auto';
  removeBtn.addEventListener('click', () => removePollOptionInput(wrapper));
  
  wrapper.appendChild(input);
  wrapper.appendChild(removeBtn);
  pollOptionsContainer.appendChild(wrapper);
  updatePollOptionPlaceholders();
  addPollOptionButton.disabled = pollOptionsContainer.querySelectorAll('.poll-option-input-wrapper').length >= 5;
}

function removePollOptionInput(wrapper) {
  wrapper.remove();
  updatePollOptionPlaceholders();
  addPollOptionButton.disabled = pollOptionsContainer.querySelectorAll('.poll-option-input-wrapper').length >= 5;
}

function updatePollOptionPlaceholders() {
  pollOptionsContainer.querySelectorAll('.poll-option-input').forEach((input, index) => {
    input.placeholder = `Option ${index + 1}`;
  });
}

function togglePollFields() {
  if (!pollFields) return;
  if (postHasPollCheckbox.checked) {
    pollFields.classList.remove('hidden');
  } else {
    pollFields.classList.add('hidden');
  }
}

function showAdminPanel() {
  adminPanel.classList.toggle('hidden');
}

function showPostForm() {
  postFormContainer.classList.remove('hidden');
}

async function addPost() {
  if (!isAdmin) {
    alert("Tu dois être admin.");
    return;
  }

  const title = document.getElementById("postTitle").value.trim();
  const text = document.getElementById("postText").value.trim();
  let mediaType = document.getElementById("postMediaType").value;
  let mediaUrl = document.getElementById("postMediaUrl").value.trim();

  const mediaFile = postMediaFileInput?.files?.[0];

  if (mediaFile) {
    try {
      mediaUrl = await readFileAsDataUrl(mediaFile);

      if (mediaFile.type.startsWith("image/")) {
        mediaType = "image";
      } else if (mediaFile.type.startsWith("video/")) {
        mediaType = "video";
      }

    } catch (err) {
      console.error(err);
      alert("Erreur fichier.");
      return;
    }
  }

  if (!title && !text && !mediaUrl) {
    alert("Ajoute du contenu.");
    return;
  }

  // IMPORTANT : vérifier Firestore
  if (!firestoreReady || !postsCollection) {
    alert("Firestore non connecté.");
    return;
  }

  try {

    // création du post
    const newPost = {
      title: title,
      text: text,
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      likes: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      pollQuestion: "",
      pollOptions: [],
      multipleChoices: false
    };

    // envoi FIRESTORE
    await postsCollection.add(newPost);

    // reset formulaire
    document.getElementById("postTitle").value = "";
    document.getElementById("postText").value = "";
    document.getElementById("postMediaUrl").value = "";
    document.getElementById("postMediaType").value = "none";

    if (postMediaFileInput) {
      postMediaFileInput.value = "";
    }

    alert("Post publié pour tout le monde !");

  } catch (error) {
    console.error("Erreur Firestore :", error);
    alert("Erreur publication.");
  }
}

function startEditPost(postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  editingPostId = postId;
  document.getElementById('postTitle').value = post.title || '';
  document.getElementById('postText').value = post.text || '';
  document.getElementById('postMediaType').value = post.mediaType || 'none';
  document.getElementById('postMediaUrl').value = post.mediaUrl || '';
  postHasPollCheckbox.checked = Boolean(post.pollQuestion && Array.isArray(post.pollOptions) && post.pollOptions.length >= 2);
  pollQuestionInput.value = post.pollQuestion || '';
  pollMultipleChoicesCheckbox.checked = post.multipleChoices || false;
  pollOptionsContainer.innerHTML = '';
  const options = Array.isArray(post.pollOptions) ? post.pollOptions : [];
  if (options.length > 0) {
    options.forEach(option => addPollOptionInput(option.text || ''));
  }
  while (pollOptionsContainer.querySelectorAll('.poll-option-input-wrapper').length < 2) {
    addPollOptionInput();
  }
  addPollOptionButton.disabled = pollOptionsContainer.querySelectorAll('.poll-option-input-wrapper').length >= 5;
  togglePollFields();
  document.getElementById('addPostButton').textContent = 'Enregistrer les modifications';
  
  // Scroll vers le formulaire
  document.getElementById('postFormContainer').scrollIntoView({ behavior: 'smooth' });
}

function deletePost(postId) {
  if (confirm('Êtes-vous sûr de vouloir supprimer ce post ?')) {
    posts = posts.filter(p => p.id !== postId);
    if (firestoreReady) {
      postsCollection.doc(postId).delete().catch(error => {
        console.error('Erreur suppression post Firestore :', error);
      });
    }
    savePosts();
    renderPosts();
  }
}

function toggleLike(postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  const index = likedPosts.indexOf(postId);
  if (index > -1) {
    likedPosts.splice(index, 1);
    post.likes--;
  } else {
    likedPosts.push(postId);
    post.likes++;
  }
  if (firestoreReady) {
    postsCollection.doc(postId).update({ likes: post.likes }).catch(error => {
      console.error('Erreur mise à jour likes Firestore :', error);
    });
  }
  savePosts();
  saveLikedPosts();
  renderPosts();
}

function sharePost(post) {
  const text = `${post.title}\n${post.text}`;
  if (navigator.share) {
    navigator.share({
      title: post.title,
      text: text,
      url: window.location.href
    });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('Contenu copié dans le presse-papiers !');
    });
  }
}

function openAiChat() {
  aiChatPanel.classList.remove('hidden');
  aiChatPanel.style.display = '';
  aiInput.focus();
}

function closeAiChat() {
  aiChatPanel.classList.add('hidden');
  aiChatPanel.style.display = 'none';
}



function panelDragStart(event) {
  if (event.button !== 0) return;
  const panel = event.currentTarget.closest('.ai-chat-panel');
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  panelDragState.active = true;
  panelDragState.panel = panel;
  panelDragState.startX = event.clientX;
  panelDragState.startY = event.clientY;
  panelDragState.panelStartLeft = rect.left;
  panelDragState.panelStartTop = rect.top;

  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  document.body.style.userSelect = 'none';
}

function panelResizeStart(event) {
  event.stopPropagation();
  if (event.button !== 0) return;
  const panel = event.currentTarget.closest('.ai-chat-panel');
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  panelResizeState.active = true;
  panelResizeState.panel = panel;
  panelResizeState.startX = event.clientX;
  panelResizeState.startY = event.clientY;
  panelResizeState.panelStartWidth = rect.width;
  panelResizeState.panelStartHeight = rect.height;

  document.body.style.userSelect = 'none';
}

function panelPointerMove(event) {
  if (panelDragState.active && panelDragState.panel) {
    const dx = event.clientX - panelDragState.startX;
    const dy = event.clientY - panelDragState.startY;
    panelDragState.panel.style.left = `${Math.max(10, panelDragState.panelStartLeft + dx)}px`;
    panelDragState.panel.style.top = `${Math.max(10, panelDragState.panelStartTop + dy)}px`;
  }

  if (panelResizeState.active && panelResizeState.panel) {
    const dx = event.clientX - panelResizeState.startX;
    const dy = event.clientY - panelResizeState.startY;
    panelResizeState.panel.style.width = `${Math.max(280, panelResizeState.panelStartWidth + dx)}px`;
    panelResizeState.panel.style.height = `${Math.max(260, panelResizeState.panelStartHeight + dy)}px`;
  }
}

function panelPointerUp() {
  panelDragState.active = false;
  panelResizeState.active = false;
  panelDragState.panel = null;
  panelResizeState.panel = null;
  document.body.style.userSelect = '';
}

function initPanelInteractions() {
  const panels = [aiChatPanel, gamesPanel, leaderboardPanel];
  panels.forEach(panel => {
    if (!panel) return;
    const header = panel.querySelector('.ai-chat-header, .games-header');
    const resizer = panel.querySelector('.panel-resizer');
    if (header) {
      header.classList.add('panel-draggable');
      header.addEventListener('mousedown', panelDragStart);
    }
    if (resizer) {
      resizer.addEventListener('mousedown', panelResizeStart);
    }
  });

  document.addEventListener('mousemove', panelPointerMove);
  document.addEventListener('mouseup', panelPointerUp);
  document.addEventListener('mouseleave', panelPointerUp);
}

const panelDragState = {
  active: false,
  panel: null,
  startX: 0,
  startY: 0,
  panelStartLeft: 0,
  panelStartTop: 0
};

const panelResizeState = {
  active: false,
  panel: null,
  startX: 0,
  startY: 0,
  panelStartWidth: 0,
  panelStartHeight: 0
};

function appendAiMessage(role, text, imageUrl) {
  const message = document.createElement('div');
  message.className = `ai-message ai-${role}`;
  if (text) {
    message.innerHTML = `<p>${text}</p>`;
  }
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = 'Image envoyée';
    message.appendChild(image);
  }
  aiMessages.appendChild(message);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function setAiStatus(message) {
  if (aiNote) {
    aiNote.textContent = message;
  }
}

function isRequestAllowed(text) {
  const forbidden = ['sexe', 'porn', 'viol', 'drugs', 'kill', 'bomb', 'terror', 'hack', 'pirate', 'racist', 'insult', 'crime'];
  const normalized = text.toLowerCase();
  return !forbidden.some(word => normalized.includes(word));
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function fetchOpenAiResponse(prompt, hasImage) {
  if (!OPENAI_API_KEY.trim()) {
    console.error('Clé OpenAI manquante : l’IA OpenAI ne peut pas répondre.');
    return 'Erreur : aucune clé OpenAI configurée. L’IA OpenAI ne peut pas répondre pour le moment.';
  }

  const systemMessage = {
    role: 'system',
    content: 'Tu es un assistant utile et respectueux. Tu réponds aux demandes simples et appropriées sans entrer dans des sujets inappropriés.'
  };
  let userContent = prompt || '';
  if (hasImage) {
    userContent += (userContent ? '\n' : '') + 'Une image a été envoyée avec cette demande. Réponds de manière claire et simple en tenant compte de cette information.';
  }
  if (!userContent) {
    userContent = 'L’utilisateur a envoyé une image sans texte. Réponds de manière simple et utile.';
  }
  if (hasImage) {
    userContent += ' Note : l’image est reçue, mais je ne peux analyser que le contexte textuel dans cette interface.';
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [systemMessage, { role: 'user', content: userContent }],
        max_tokens: 250,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      if (response.status === 401 || response.status === 403) {
        return 'La clé OpenAI est invalide ou non autorisée. Vérifie ta clé et enregistre-la.';
      }
      if (response.status === 429) {
        return 'Trop de requêtes vers OpenAI. Réessaie dans quelques minutes.';
      }
      return 'Échec de la requête OpenAI. Vérifie la clé API ou réessaie plus tard.';
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Désolé, je n’ai pas obtenu de réponse. Essaie une autre question simple.';
  } catch (error) {
    console.error('OpenAI fetch error:', error);
    return 'Désolé, il y a eu un problème avec l’IA OpenAI. Réessaye dans quelques instants.';
  }
}

function generateAiResponse(text, hasImage) {
  const normalized = (text || '').trim().toLowerCase();
  const greetings = ['bonjour', 'salut', 'coucou', 'hey', 'hello'];
  const farewells = ['au revoir', 'à bientôt', 'bye', 'salut'];
  const thanks = ['merci', 'thanks', 'super', 'top', 'cool'];

  if (hasImage && !normalized) {
    return randomChoice([
      'J’ai bien reçu ton image. Dis-moi ce que tu veux savoir ou ce que tu cherches.',
      'Image reçue ! Tu peux maintenant me poser une question simple sur ce que tu as envoyé.',
      'Merci pour l’image. Si tu veux, décris ce que tu veux que je regarde ou que je t’explique.'
    ]);
  }

  if (!normalized) {
    return randomChoice([
      'Écris-moi une question simple ou envoie une image pour commencer.',
      'Je suis prêt, pose-moi une question claire et je te réponds simplement.',
      'Je peux t’aider sur un sujet simple — essaie une question courte.'
    ]);
  }

  if (greetings.some(word => normalized.includes(word))) {
    return randomChoice([
      'Salut ! Que veux-tu savoir aujourd’hui ?',
      'Bonjour ! Pose-moi une question simple ou envoie une image.',
      'Salut ! Je suis là pour t’aider sur des sujets simples.'
    ]);
  }

  if (farewells.some(word => normalized.includes(word))) {
    return randomChoice([
      'À bientôt ! N’hésite pas à revenir si tu as d’autres questions.',
      'Au revoir ! Je suis là si tu veux poser une autre question.',
      'À plus tard ! Reviens quand tu veux pour une autre question simple.'
    ]);
  }

  if (thanks.some(word => normalized.includes(word))) {
    return randomChoice([
      'Avec plaisir ! Si tu veux, tu peux me poser autre chose.',
      'Merci ! Dis-moi si tu veux un autre renseignement.',
      'Content d’avoir pu aider. Pose-moi une autre question si tu veux.'
    ]);
  }

  if (normalized.includes('qui es') || normalized.includes('tu es')) {
    return randomChoice([
      'Je suis une IA locale simple intégrée à ce site. Je réponds aux questions claires et respectueuses.',
      'Je suis le chat IA du site. Je peux répondre à des questions simples et donner des conseils basiques.',
      'Je suis un assistant du site, conçu pour aider sur des sujets simples sans clé API.'
    ]);
  }

  if (normalized.includes('aide') || normalized.includes('comment') || normalized.includes('peux-tu') || normalized.includes('peux tu')) {
    return randomChoice([
      'Je suis là pour t’aider. Pose-moi une question simple sur un sujet clair.',
      'Demande-moi quelque chose de simple, comme une explication courte ou un conseil basique.',
      'Je peux te donner une réponse simple si tu formules une question claire.'
    ]);
  }

  if (normalized.includes('image') || normalized.includes('photo')) {
    return randomChoice([
      'Je reçois ton image, mais je traite surtout le texte. Dis-moi ce que tu veux savoir à propos de l’image.',
      'Ton image est bien reçue. Pose-moi une question claire sur son contenu ou son usage.',
      'Je peux t’aider à décrire une image si tu me dis ce que tu veux en savoir.'
    ]);
  }

  if (normalized.includes('site') || normalized.includes('web') || normalized.includes('page')) {
    return randomChoice([
      'Ce site présente un chat IA local et un espace de posts. Je peux répondre à des questions simples dessus.',
      'Je suis intégré à cette page web pour aider à répondre à des questions simples sans API externe.',
      'Le site contient un chat IA et des posts, et je suis là pour te répondre avec des réponses simples.'
    ]);
  }

  if (normalized.includes('heure') || normalized.includes('météo') || normalized.includes('temps')) {
    return randomChoice([
      'Je ne peux pas lire la météo en direct, mais je peux te donner une réponse simple sur les sujets que tu demandes.',
      'Je n’ai pas accès au temps réel ici, mais je peux t’aider avec une réponse générale ou des conseils.',
      'Je ne vois pas la météo actuelle. Pose-moi une autre question simple si tu veux.'
    ]);
  }

  if (normalized.includes('blague') || normalized.includes('humour') || normalized.includes('drôle')) {
    return randomChoice([
      'Pourquoi les programmeurs confondent Halloween et Noël ? Parce que OCT 31 = DEC 25.',
      'Voici une blague simple : pourquoi l’ordinateur était fatigué ? Parce qu’il avait trop de bits à traiter.',
      'Je peux te faire rire un peu : un bug entre dans un bar et le barman dit "Pas de blague".'
    ]);
  }

  if (normalized.includes('pourquoi') || normalized.includes('pq')) {
    return randomChoice([
      'C\'est une bonne question. La réponse dépend souvent du contexte. Peux-tu donner plus de détails ?',
      'Pourquoi ? C\'est une question profonde. En général, les choses arrivent pour des raisons variées.',
      'Je ne peux pas lire dans les pensées, mais je peux essayer de t\'expliquer si tu précises.'
    ]);
  }

  // Réponses basiques à des sujets courants
  if (normalized.includes('ciel') || normalized.includes('bleu')) {
    return 'Le ciel apparaît bleu parce que la lumière du soleil se diffuse dans l\'atmosphère terrestre.';
  }

  if (normalized.includes('ordinateur') || normalized.includes('pc') || normalized.includes('informatique')) {
    return 'Les ordinateurs sont des machines qui traitent des informations. Ils utilisent un processeur, de la mémoire RAM, un disque dur, etc.';
  }

  if (normalized.includes('internet') || normalized.includes('web')) {
    return 'Internet est un réseau mondial qui connecte des milliards d\'ordinateurs. Il permet de partager des informations et communiquer.';
  }

  if (normalized.includes('couleur') || normalized.includes('couleurs')) {
    return 'Les couleurs sont créées par la lumière. Les couleurs primaires sont le rouge, le bleu et le vert.';
  }

  if (normalized.includes('animaux') || normalized.includes('animal')) {
    return 'Les animaux sont des êtres vivants qui ne sont pas des plantes. Il existe des mammifères, oiseaux, reptiles, etc.';
  }

  if (normalized.includes('nourriture') || normalized.includes('manger')) {
    return 'La nourriture est essentielle pour la santé. Mangez équilibré : fruits, légumes, protéines, glucides et matières grasses.';
  }

  if (normalized.includes('sport') || normalized.includes('sports')) {
    return 'Le sport est bon pour la santé. Il y a le football, le basket, la natation, etc. Choisis celui que tu aimes !';
  }

  if (normalized.includes('musique') || normalized.includes('chanson')) {
    return 'La musique est un art qui utilise le son. Il y a du rock, du pop, du classique, etc. Quelle est ta préférée ?';
  }

  // Fallback plus varié et utile
  return randomChoice([
    'Je ne suis pas sûr de comprendre ta question. Peux-tu la reformuler de manière plus simple ?',
    'Essaie de poser une question plus claire ou sur un sujet que je connais.',
    'Je réponds mieux aux questions simples. Dis-moi ce que tu veux savoir exactement.',
    'Pose-moi une question sur le site, une blague ou un sujet basique.',
    'Je peux t’aider avec des conseils simples ou des explications courtes. Essaie autre chose.'
  ]);
}

function initBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      board[r][c] = 0;
    }
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, tetrisCanvas.width, tetrisCanvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        ctx.fillStyle = COLORS[board[r][c]];
        ctx.fillRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      }
    }
  }
  // Draw current piece
  if (currentPiece) {
    for (let r = 0; r < currentPiece.length; r++) {
      for (let c = 0; c < currentPiece[r].length; c++) {
        if (currentPiece[r][c]) {
          ctx.fillStyle = COLORS[currentPieceId];
          ctx.fillRect((currentX + c) * BLOCK_SIZE, (currentY + r) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          ctx.strokeStyle = '#000';
          ctx.strokeRect((currentX + c) * BLOCK_SIZE, (currentY + r) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        }
      }
    }
  }
}

function newPiece() {
  const type = Math.floor(Math.random() * PIECES.length);
  currentPieceId = type + 1;
  currentPiece = PIECES[type].map(row => [...row]);
  currentX = Math.floor(COLS / 2) - 1;
  currentY = 0;
  if (collision()) {
    gameOver();
  }
}

function collision() {
  for (let r = 0; r < currentPiece.length; r++) {
    for (let c = 0; c < currentPiece[r].length; c++) {
      if (currentPiece[r][c]) {
        const newX = currentX + c;
        const newY = currentY + r;
        if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && board[newY][newX])) {
          return true;
        }
      }
    }
  }
  return false;
}

function placePiece() {
  for (let r = 0; r < currentPiece.length; r++) {
    for (let c = 0; c < currentPiece[r].length; c++) {
      if (currentPiece[r][c]) {
        board[currentY + r][currentX + c] = currentPieceId;
      }
    }
  }
  clearLines();
  newPiece();
}

function clearLines() {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      score += 100;
      scoreElement.textContent = `Score: ${score}`;
      r++; // Check the same row again
    }
  }
}

function rotatePiece() {
  const rotated = currentPiece[0].map((_, index) => currentPiece.map(row => row[index]).reverse());
  const oldPiece = currentPiece;
  currentPiece = rotated;
  if (collision()) {
    currentPiece = oldPiece;
  }
}

function movePiece(dx, dy) {
  currentX += dx;
  currentY += dy;
  if (collision()) {
    currentX -= dx;
    currentY -= dy;
    if (dy > 0) {
      placePiece();
    }
  }
}

function dropPiece() {
  while (!collision()) {
    currentY++;
  }
  currentY--;
  placePiece();
}

function gameLoop() {
  movePiece(0, 1);
  drawBoard();
}

function startTetris() {
  if (gameInterval) return;
  initBoard();
  score = 0;
  scoreElement.textContent = 'Score: 0';
  ctx = tetrisCanvas.getContext('2d');
  newPiece();
  gameInterval = setInterval(gameLoop, 500);
  startGameButton.textContent = 'Arrêter';
}

function stopTetris() {
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
    startGameButton.textContent = 'Démarrer';
  }
}

function gameOver() {
  stopTetris();
  updateTetrisLeaderboard(playerNameInput?.value || 'Joueur', score);
  alert('Game Over! Score: ' + score);
}

function onTetrisPointerDown(event) {
  if (!gameInterval || !tetrisCanvas) return;
  event.preventDefault();
  tetrisPointerState.active = true;
  tetrisPointerState.startX = event.clientX;
  tetrisPointerState.startY = event.clientY;
  tetrisPointerState.lastX = event.clientX;
  tetrisPointerState.lastY = event.clientY;
  tetrisPointerState.moved = false;
  tetrisCanvas.setPointerCapture(event.pointerId);
}

function onTetrisPointerMove(event) {
  if (!tetrisPointerState.active) return;
  const dx = event.clientX - tetrisPointerState.lastX;
  const dy = event.clientY - tetrisPointerState.lastY;
  if (Math.abs(dx) >= 20) {
    movePiece(dx > 0 ? 1 : -1, 0);
    tetrisPointerState.lastX = event.clientX;
    tetrisPointerState.moved = true;
    drawBoard();
  } else if (dy >= 25) {
    movePiece(0, 1);
    tetrisPointerState.lastY = event.clientY;
    tetrisPointerState.moved = true;
    drawBoard();
  }
}

function onTetrisPointerUp(event) {
  if (!tetrisPointerState.active) return;
  const totalDx = event.clientX - tetrisPointerState.startX;
  const totalDy = event.clientY - tetrisPointerState.startY;
  if (!tetrisPointerState.moved && Math.abs(totalDx) < 15 && Math.abs(totalDy) < 15) {
    rotatePiece();
    drawBoard();
  }
  tetrisPointerState.active = false;
  tetrisPointerState.moved = false;
  if (tetrisCanvas && tetrisCanvas.hasPointerCapture(event.pointerId)) {
    tetrisCanvas.releasePointerCapture(event.pointerId);
  }
}

async function handleAiSend() {
  const userText = aiInput.value.trim();
  const file = aiFileInput.files[0];
  if (!userText && !file) {
    setAiStatus('Écris une demande ou ajoute une image.');
    return;
  }
  if (userText && !isRequestAllowed(userText)) {
    appendAiMessage('user', userText);
    appendAiMessage('bot', 'Cette demande n’est pas autorisée. Pose une question simple, respectueuse et claire.');
    aiInput.value = '';
    aiFileInput.value = '';
    aiFileInput.previousElementSibling.textContent = '+ Image';
    setAiStatus('Demande non autorisée.');
    return;
  }

  const userLabel = userText || (file ? 'J’ai envoyé une image.' : '');
  if (userLabel) {
    appendAiMessage('user', userLabel);
  }
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      appendAiMessage('user', '', reader.result);
    };
    reader.readAsDataURL(file);
  }

  aiSendButton.disabled = true;
  setAiStatus('Envoi à l’IA OpenAI...');

  const response = await fetchOpenAiResponse(userText, Boolean(file));
  appendAiMessage('bot', response);

  aiSendButton.disabled = false;
  setAiStatus('L’IA OpenAI a répondu. Tu peux poser une autre question simple.');

  aiInput.value = '';
  aiFileInput.value = '';
  aiFileInput.previousElementSibling.textContent = '+ Image';
}

function loginAdmin() {
  const passwordInput = document.getElementById('adminPassword').value;
  if (passwordInput === adminPassword) {
    isAdmin = true;
    localStorage.setItem('isAdmin', 'true');
    updateAdminUI();
    renderPosts();
    adminLoginButton.textContent = 'Admin connecté';
    adminLoginButton.disabled = true;
    document.getElementById('adminPassword').disabled = true;
    return;
  }
  alert('Mot de passe incorrect.');
}

function updateAdminUI() {
  if (!isAdmin) return;
  showPostForm();
  if (deleteAllPostsButton) {
    deleteAllPostsButton.style.display = 'block';
  }
}

function deleteAllPosts() {
  if (!isAdmin) {
    alert('Seul l’admin peut supprimer tous les posts.');
    return;
  }

  if (!confirm('Voulez-vous vraiment supprimer TOUS les posts ? Cette action est irréversible.')) {
    return;
  }

  posts = [];
  savePosts();
  renderPosts();

  if (!firestoreReady) {
    alert('La suppression globale n’est pas possible tant que Firestore n’est pas connecté.');
  }

  if (firestoreReady && postsCollection) {
    postsCollection.get().then(snapshot => {
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).catch(error => {
      console.error('Erreur suppression Firestore de tous les posts :', error);
    });
  }

  alert('Tous les posts ont été supprimés.');
}

themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  updateButtonText();
});

adminToggle.addEventListener('click', showAdminPanel);
adminLoginButton.addEventListener('click', loginAdmin);
addPostButton.addEventListener('click', addPost);
if (postHasPollCheckbox) {
  postHasPollCheckbox.addEventListener('change', togglePollFields);
}
if (addPollOptionButton) {
  addPollOptionButton.addEventListener('click', () => addPollOptionInput());
}
if (deleteAllPostsButton) {
  deleteAllPostsButton.addEventListener('click', deleteAllPosts);
}
aiToggle.addEventListener('click', openAiChat);
if (aiClose) {
  aiClose.addEventListener('click', (event) => {
    event.preventDefault();
    closeAiChat();
  });
} else {
  console.warn('aiClose button not found');
}
aiSendButton.addEventListener('click', handleAiSend);
aiInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleAiSend();
  }
});
aiFileInput.addEventListener('change', () => {
  if (aiFileInput.files.length > 0) {
    aiFileInput.previousElementSibling.textContent = 'Image sélectionnée';
  }
});



// Initialisation
loadPosts();
loadVotedPolls();
renderPosts();
if (isAdmin) {
  updateAdminUI();
}
updateButtonText();

window.addEventListener('load', () => {
  if (checkFirestorePrerequisites()) {
    initFirebase();
  } else {
    updateSyncStatus('Mode local activé : Firestore n’est pas disponible, les posts restent en local.', true);
  }
  initPanelInteractions();
  askPostNotificationsPermission();
});

