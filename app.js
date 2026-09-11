(function () {
  'use strict';

  var STORAGE_KEY = 'todos-app-v1';
  var SEEN_KEY = 'todos-app-seen-v1';
  var PRIORITIES = ['High', 'Medium', 'Low'];
  var PALETTE = ['#e8384f', '#fd612c', '#f5c400', '#5da283', '#3e9fdb', '#8f6ee5', '#ea4e9d', '#7a8ca0'];

  // ---------- state ----------

  // These two must be declared before load() runs, or its results get wiped.
  var storageWorks = true;
  var newlyAdded = 0; // how many items starter-data.js contributed on this load
  var useFirebase = window.db && window.auth; // Check if Firebase is available
  var firebaseReady = false;
  var userId = null;

  var state = load();

  // View state — not persisted.
  var scope = 'all';            // 'all' | 'none' | a project id
  var priorityFilter = '';      // '' | 'High' | 'Medium' | 'Low'
  var sortBy = 'priority';      // 'priority' | 'project' | 'newest'
  var searchText = '';          // text typed into the search box
  var expandedId = null;        // task whose project picker is open
  var notesId = null;           // task whose notes are displayed
  var formProjects = [];        // project ids selected in the add-task form
  var showCompleted = false;

  function copyTask(t) {
    return {
      id: t.id, title: t.title, priority: t.priority,
      projectIds: t.projectIds.slice(), done: !!t.done, createdAt: t.createdAt,
      notes: t.notes || ''
    };
  }

  function readSeen() {
    try {
      var raw = localStorage.getItem(SEEN_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) { /* treated as nothing seen yet */ }
    return [];
  }

  // Record every id starter-data.js has ever offered, so anything deleted
  // here stays deleted instead of reappearing on the next open.
  function rememberStarter(starter) {
    var ids = {};
    readSeen().forEach(function (id) { ids[id] = true; });
    starter.projects.forEach(function (p) { ids[p.id] = true; });
    starter.tasks.forEach(function (t) { ids[t.id] = true; });
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(Object.keys(ids)));
    } catch (e) { /* storage blocked; warned about separately */ }
  }

  function load() {
    var saved = null;

    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        saved = {
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
        };
      }
    } catch (e) {
      storageWorks = false;
      console.warn('This browser will not let the app save data here.', e);
    }

    var starter = (window.STARTER_DATA && Array.isArray(window.STARTER_DATA.tasks))
      ? window.STARTER_DATA : null;

    // First ever open in this browser — take everything from the starter file.
    if (!saved) {
      if (!starter) return { projects: [], tasks: [] };
      rememberStarter(starter);
      return {
        projects: starter.projects.slice(),
        tasks: starter.tasks.map(copyTask)
      };
    }

    // Already has data — pull in only starter items this browser has never seen.
    if (starter) {
      var known = {};
      readSeen().forEach(function (id) { known[id] = true; });
      saved.projects.forEach(function (p) { known[p.id] = true; });
      saved.tasks.forEach(function (t) { known[t.id] = true; });

      starter.projects.forEach(function (p) {
        if (!known[p.id]) saved.projects.push({ id: p.id, name: p.name, color: p.color });
      });
      starter.tasks.forEach(function (t) {
        if (!known[t.id]) {
          saved.tasks.push(copyTask(t));
          newlyAdded++;
        }
      });

      rememberStarter(starter);
    }

    return saved;
  }

  function banner(text, className) {
    var bar = document.createElement('div');
    bar.className = className;
    bar.textContent = text;
    document.body.insertBefore(bar, document.body.firstChild);
    return bar;
  }

  // Shown only when the browser blocks saving, so data loss is never silent.
  function warnIfStorageBlocked() {
    if (storageWorks) return;
    banner('This browser is not letting the app save your changes. ' +
      'Anything you add will disappear when you close the tab. ' +
      'Try opening the app in Chrome instead.', 'warning');
  }

  function announceNewTasks() {
    if (!newlyAdded) return;
    var bar = banner(newlyAdded + (newlyAdded === 1 ? ' new task was' : ' new tasks were') +
      ' added to your list.', 'notice');
    setTimeout(function () {
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    }, 15000);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      if (storageWorks) {
        storageWorks = false;
        warnIfStorageBlocked();
      }
    }
    if (firebaseReady && userId) saveToFirebase();
  }

  function saveToFirebase() {
    if (!useFirebase || !firebaseReady || !userId) return;
    try {
      db.collection('users').doc(userId).set({
        projects: state.projects,
        tasks: state.tasks,
        lastUpdated: new Date()
      }).catch(function(err) {
        console.error('Firebase save error:', err);
      });
    } catch (e) {
      console.error('Firebase save error:', e);
    }
  }

  function loadFromFirebase() {
    if (!useFirebase || !userId) return Promise.resolve();
    return db.collection('users').doc(userId).get()
      .then(function(doc) {
        if (doc.exists) {
          var data = doc.data();
          if (data.projects && data.tasks) {
            state.projects = data.projects || [];
            state.tasks = data.tasks || [];
            state.tasks.forEach(function (t) {
              if (!Array.isArray(t.projectIds)) t.projectIds = [];
              if (!t.notes) t.notes = '';
            });
            return true;
          }
        }
        return false;
      })
      .catch(function(err) {
        console.error('Firebase load error:', err);
        return false;
      });
  }

  function initFirebase() {
    if (!useFirebase) return;
    auth.onAuthStateChanged(function(user) {
      if (user) {
        userId = user.uid;
        firebaseReady = true;
        updateAuthUI(user);
        loadFromFirebase().then(function(loaded) {
          if (loaded) {
            render();
          }
          // Listen for real-time updates
          db.collection('users').doc(userId).onSnapshot(function(doc) {
            if (doc.exists && doc.metadata.hasPendingWrites === false) {
              var data = doc.data();
              if (data.projects && data.tasks) {
                state.projects = data.projects;
                state.tasks = data.tasks;
                render();
              }
            }
          });
        });
      } else {
        updateAuthUI(null);
      }
    });
  }

  function signInWithGoogle() {
    if (!useFirebase) return;
    auth.signInWithPopup(googleProvider)
      .catch(function(err) {
        console.error('Google Sign-In error:', err);
        alert('Sign in failed: ' + err.message);
      });
  }

  function signOut() {
    if (!useFirebase) return;
    auth.signOut().catch(function(err) {
      console.error('Sign out error:', err);
    });
  }

  function updateAuthUI(user) {
    var btn = el.authBtn;
    if (user) {
      btn.textContent = 'Sign out (' + (user.displayName || user.email || 'User') + ')';
      btn.style.color = '#4573d2';
    } else {
      btn.textContent = 'Sign in with Google';
      btn.style.color = 'inherit';
    }
  }

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function projectById(id) {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === id) return state.projects[i];
    }
    return null;
  }

  // ---------- elements ----------

  var el = {
    summary: document.getElementById('summary'),
    projectList: document.getElementById('projectList'),
    projectForm: document.getElementById('projectForm'),
    projectName: document.getElementById('projectName'),
    taskForm: document.getElementById('taskForm'),
    taskTitle: document.getElementById('taskTitle'),
    taskPriority: document.getElementById('taskPriority'),
    taskSubmit: document.getElementById('taskSubmit'),
    formProjects: document.getElementById('formProjects'),
    searchInput: document.getElementById('searchInput'),
    filterScope: document.getElementById('filterScope'),
    filterPriority: document.getElementById('filterPriority'),
    sortBy: document.getElementById('sortBy'),
    taskList: document.getElementById('taskList'),
    completedSection: document.getElementById('completedSection'),
    completedToggle: document.getElementById('completedToggle'),
    completedList: document.getElementById('completedList'),
    emptyState: document.getElementById('emptyState'),
    authBtn: document.getElementById('authBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile')
  };

  // ---------- backup / restore ----------

  function exportBackup() {
    var stamp = new Date().toISOString().slice(0, 10);
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'todos-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        alert('That file is not a valid backup.');
        return;
      }
      if (!data || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
        alert('That file is not a valid backup.');
        return;
      }
      if (!confirm('Replace everything currently in this app with the backup?\n\n' +
                   data.tasks.length + ' task(s), ' + data.projects.length + ' project(s).')) return;

      state = { projects: data.projects, tasks: data.tasks };
      // Tolerate hand-edited or older backups.
      state.tasks.forEach(function (t) {
        if (!Array.isArray(t.projectIds)) t.projectIds = [];
        if (PRIORITIES.indexOf(t.priority) === -1) t.priority = 'Medium';
        if (!t.createdAt) t.createdAt = Date.now();
        if (!t.notes) t.notes = '';
        t.done = !!t.done;
      });
      scope = 'all';
      priorityFilter = '';
      el.filterPriority.value = '';
      resetForm();
      save();
      render();
    };
    reader.readAsText(file);
  }

  // ---------- actions ----------

  function addProject(name) {
    name = name.trim();
    if (!name) return;
    state.projects.push({
      id: uid(),
      name: name,
      color: PALETTE[state.projects.length % PALETTE.length]
    });
    save();
    render();
  }

  function deleteProject(id) {
    var project = projectById(id);
    if (!project) return;
    var used = state.tasks.filter(function (t) { return t.projectIds.indexOf(id) !== -1; }).length;
    var message = 'Delete project "' + project.name + '"?';
    if (used) message += '\n\n' + used + ' task(s) will stay, untagged from this project.';
    if (!confirm(message)) return;

    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    state.tasks.forEach(function (t) {
      t.projectIds = t.projectIds.filter(function (pid) { return pid !== id; });
    });
    if (scope === id) scope = 'all';
    formProjects = formProjects.filter(function (pid) { return pid !== id; });
    save();
    render();
  }

  function submitTask() {
    var title = el.taskTitle.value.trim();
    if (!title) {
      el.taskTitle.focus();
      return;
    }

    state.tasks.push({
      id: uid(),
      title: title,
      priority: el.taskPriority.value,
      projectIds: formProjects.slice(),
      done: false,
      createdAt: Date.now(),
      notes: ''
    });

    resetForm();
    save();
    render();
    el.taskTitle.focus();
  }

  function taskById(id) {
    return state.tasks.filter(function (t) { return t.id === id; })[0] || null;
  }

  // ---------- editing straight on the row ----------

  function setTitle(id, title) {
    var task = taskById(id);
    title = title.trim();
    if (!task || !title || title === task.title) return false;
    task.title = title;
    save();
    return true;
  }

  function setPriority(id, priority) {
    var task = taskById(id);
    if (!task || PRIORITIES.indexOf(priority) === -1) return;
    task.priority = priority;
    save();
    render();
  }

  function toggleTaskProject(id, projectId) {
    var task = taskById(id);
    if (!task) return;
    var i = task.projectIds.indexOf(projectId);
    if (i === -1) task.projectIds.push(projectId);
    else task.projectIds.splice(i, 1);
    save();
    render();
  }

  function resetForm() {
    el.taskTitle.value = '';
    el.taskPriority.value = 'Medium';
    // When viewing one project, new tasks default into it.
    formProjects = (scope !== 'all' && scope !== 'none' && projectById(scope)) ? [scope] : [];
  }

  function toggleDone(id) {
    state.tasks.forEach(function (t) {
      if (t.id === id) {
        t.done = !t.done;
        t.completedAt = t.done ? Date.now() : null;
      }
    });
    save();
    render();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    if (expandedId === id) expandedId = null;
    if (notesId === id) notesId = null;
    save();
    render();
  }

  function setNotes(id, text) {
    var task = taskById(id);
    if (!task) return;
    task.notes = text;
    save();
  }

  // ---------- rendering ----------

  function visibleTasks() {
    var needle = searchText.trim().toLowerCase();
    return state.tasks.filter(function (t) {
      if (scope === 'none' && t.projectIds.length) return false;
      if (scope !== 'all' && scope !== 'none' && t.projectIds.indexOf(scope) === -1) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (needle && t.title.toLowerCase().indexOf(needle) === -1) return false;
      return true;
    });
  }

  function byPriorityThenNewest(a, b) {
    var diff = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
    if (diff !== 0) return diff;
    return b.createdAt - a.createdAt;
  }

  function byNewest(a, b) {
    return b.createdAt - a.createdAt;
  }

  // One heading per project, tasks sorted by priority inside each.
  // A task tagged to two projects appears under both.
  function projectGroups(tasks) {
    var groups = [];

    state.projects.forEach(function (p) {
      var inProject = tasks.filter(function (t) {
        return t.projectIds.indexOf(p.id) !== -1;
      }).sort(byPriorityThenNewest);
      if (inProject.length) groups.push({ title: p.name, tasks: inProject });
    });

    var untagged = tasks.filter(function (t) { return !t.projectIds.length; })
      .sort(byPriorityThenNewest);
    if (untagged.length) groups.push({ title: 'No project', tasks: untagged });

    return groups;
  }

  function groupHeading(text) {
    var li = document.createElement('li');
    li.className = 'group-title';
    li.textContent = text;
    return li;
  }

  function renderProjects() {
    el.projectList.textContent = '';

    var openCount = state.tasks.filter(function (t) { return !t.done; }).length;
    el.projectList.appendChild(projectRow('all', 'All tasks', null, openCount));

    state.projects.forEach(function (p) {
      var n = state.tasks.filter(function (t) {
        return !t.done && t.projectIds.indexOf(p.id) !== -1;
      }).length;
      el.projectList.appendChild(projectRow(p.id, p.name, p.color, n));
    });

    var untagged = state.tasks.filter(function (t) { return !t.done && !t.projectIds.length; }).length;
    if (untagged) el.projectList.appendChild(projectRow('none', 'No project', null, untagged));
  }

  function projectRow(id, name, color, count) {
    var li = document.createElement('li');
    if (scope === id) li.className = 'active';

    var dot = document.createElement('span');
    dot.className = 'dot';
    if (color) dot.style.background = color;
    else dot.style.visibility = 'hidden';

    var label = document.createElement('span');
    label.className = 'project-name';
    label.textContent = name;

    var badge = document.createElement('span');
    badge.className = 'count';
    badge.textContent = count ? String(count) : '';

    li.appendChild(dot);
    li.appendChild(label);
    li.appendChild(badge);

    if (color) {
      var remove = document.createElement('button');
      remove.className = 'remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Delete project';
      remove.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteProject(id);
      });
      li.appendChild(remove);
    }

    li.addEventListener('click', function () {
      scope = id;
      resetForm();
      render();
    });

    return li;
  }

  function renderFormProjects() {
    el.formProjects.textContent = '';

    if (!state.projects.length) {
      var hint = document.createElement('span');
      hint.className = 'chip-empty';
      hint.textContent = 'Add a project on the left to tag tasks.';
      el.formProjects.appendChild(hint);
      return;
    }

    state.projects.forEach(function (p) {
      var on = formProjects.indexOf(p.id) !== -1;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = on ? 'chip on' : 'chip';
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');

      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(p.name));

      chip.addEventListener('click', function () {
        var i = formProjects.indexOf(p.id);
        if (i === -1) formProjects.push(p.id);
        else formProjects.splice(i, 1);
        renderFormProjects();
      });

      el.formProjects.appendChild(chip);
    });
  }

  // Click the title to rename it in place. Enter or clicking away saves;
  // Escape puts the old text back.
  function editTitleInPlace(titleEl, task) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'title-input';
    input.value = task.title;
    input.maxLength = 200;

    var finished = false;
    function finish(keep) {
      if (finished) return;
      finished = true;
      if (keep && setTitle(task.id, input.value)) render();
      else if (input.parentNode) input.parentNode.replaceChild(titleEl, input);
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', function () { finish(true); });

    titleEl.parentNode.replaceChild(input, titleEl);
    input.focus();
    input.select();
  }

  function priorityPicker(task) {
    var select = document.createElement('select');
    select.className = 'priority-select ' + task.priority;
    select.setAttribute('aria-label', 'Priority');
    PRIORITIES.forEach(function (p) {
      var option = document.createElement('option');
      option.value = p;
      option.textContent = p;
      if (p === task.priority) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', function () { setPriority(task.id, select.value); });
    return select;
  }

  function projectPicker(task) {
    var wrap = document.createElement('div');
    wrap.className = 'row-projects';

    if (!state.projects.length) {
      var hint = document.createElement('span');
      hint.className = 'chip-empty';
      hint.textContent = 'Add a project on the left first.';
      wrap.appendChild(hint);
      return wrap;
    }

    state.projects.forEach(function (p) {
      var on = task.projectIds.indexOf(p.id) !== -1;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = on ? 'chip on' : 'chip';
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');

      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(p.name));

      chip.addEventListener('click', function () { toggleTaskProject(task.id, p.id); });
      wrap.appendChild(chip);
    });

    return wrap;
  }

  function taskRow(task) {
    var li = document.createElement('li');
    li.className = task.done ? 'task done' : 'task';

    var check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = task.done;
    check.setAttribute('aria-label', 'Mark "' + task.title + '" done');
    check.addEventListener('change', function () { toggleDone(task.id); });

    var body = document.createElement('div');
    body.className = 'task-body';

    var title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;
    title.title = 'Click to edit';
    title.addEventListener('click', function () { editTitleInPlace(title, task); });
    body.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.appendChild(priorityPicker(task));

    task.projectIds.forEach(function (pid) {
      var p = projectById(pid);
      if (!p) return;
      var tag = document.createElement('span');
      tag.className = 'tag';
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      tag.appendChild(dot);
      tag.appendChild(document.createTextNode(p.name));
      meta.appendChild(tag);
    });

    var open = expandedId === task.id;
    var projectsBtn = document.createElement('button');
    projectsBtn.type = 'button';
    projectsBtn.className = open ? 'tag-toggle on' : 'tag-toggle';
    projectsBtn.textContent = task.projectIds.length ? 'Change projects' : '+ Add project';
    projectsBtn.addEventListener('click', function () {
      expandedId = open ? null : task.id;
      render();
    });
    meta.appendChild(projectsBtn);

    body.appendChild(meta);
    if (open) body.appendChild(projectPicker(task));

    var actions = document.createElement('div');
    actions.className = 'task-actions';

    var notesBtn = document.createElement('button');
    notesBtn.type = 'button';
    notesBtn.className = task.notes ? 'notes on' : 'notes';
    notesBtn.textContent = 'Notes';
    notesBtn.title = task.notes ? 'Edit notes' : 'Add notes';
    notesBtn.addEventListener('click', function () {
      notesId = notesId === task.id ? null : task.id;
      render();
    });
    actions.appendChild(notesBtn);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = 'Delete';
    del.title = 'Delete this task for good';
    del.addEventListener('click', function () { deleteTask(task.id); });
    actions.appendChild(del);

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(actions);

    if (notesId === task.id) {
      var notesEditor = document.createElement('div');
      notesEditor.className = 'notes-editor';
      var textarea = document.createElement('textarea');
      textarea.className = 'notes-textarea';
      textarea.value = task.notes || '';
      textarea.placeholder = 'Add notes or bullet points...';
      textarea.addEventListener('input', function () {
        setNotes(task.id, textarea.value);
      });
      notesEditor.appendChild(textarea);
      li.appendChild(notesEditor);
    }

    return li;
  }

  function render() {
    renderProjects();
    renderFormProjects();

    var open = state.tasks.filter(function (t) { return !t.done; }).length;
    el.summary.textContent = open + ' open · ' + state.tasks.length + ' total';

    if (scope === 'all') el.filterScope.textContent = 'All tasks';
    else if (scope === 'none') el.filterScope.textContent = 'No project';
    else el.filterScope.textContent = (projectById(scope) || {}).name || 'All tasks';

    var shown = visibleTasks();
    var openTasks = shown.filter(function (t) { return !t.done; });
    var doneTasks = shown.filter(function (t) { return t.done; })
      .sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });

    el.taskList.textContent = '';
    if (sortBy === 'project') {
      projectGroups(openTasks).forEach(function (group) {
        el.taskList.appendChild(groupHeading(group.title + ' (' + group.tasks.length + ')'));
        group.tasks.forEach(function (t) { el.taskList.appendChild(taskRow(t)); });
      });
    } else {
      openTasks.sort(sortBy === 'newest' ? byNewest : byPriorityThenNewest);
      openTasks.forEach(function (t) { el.taskList.appendChild(taskRow(t)); });
    }

    el.completedSection.hidden = !doneTasks.length;
    el.completedToggle.textContent = (showCompleted ? '▾ ' : '▸ ') + 'Completed (' + doneTasks.length + ')';
    el.completedList.textContent = '';
    if (showCompleted) {
      doneTasks.forEach(function (t) { el.completedList.appendChild(taskRow(t)); });
    }

    el.emptyState.textContent = searchText.trim()
      ? 'No tasks match “' + searchText.trim() + '”.'
      : 'Nothing here yet.';
    el.emptyState.hidden = shown.length > 0;
  }

  // ---------- wiring ----------

  el.projectForm.addEventListener('submit', function (e) {
    e.preventDefault();
    addProject(el.projectName.value);
    el.projectName.value = '';
    el.projectName.focus();
  });

  el.taskForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitTask();
  });

  el.searchInput.addEventListener('input', function () {
    searchText = el.searchInput.value;
    render();
  });

  el.searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      el.searchInput.value = '';
      searchText = '';
      render();
    }
  });

  el.filterPriority.addEventListener('change', function () {
    priorityFilter = el.filterPriority.value;
    render();
  });

  el.sortBy.addEventListener('change', function () {
    sortBy = el.sortBy.value;
    render();
  });

  el.completedToggle.addEventListener('click', function () {
    showCompleted = !showCompleted;
    render();
  });

  el.authBtn.addEventListener('click', function () {
    if (auth.currentUser) {
      signOut();
    } else {
      signInWithGoogle();
    }
  });

  el.exportBtn.addEventListener('click', exportBackup);

  el.importBtn.addEventListener('click', function () { el.importFile.click(); });

  el.importFile.addEventListener('change', function () {
    if (el.importFile.files && el.importFile.files[0]) importBackup(el.importFile.files[0]);
    el.importFile.value = '';
  });

  resetForm();
  render();
  warnIfStorageBlocked();
  announceNewTasks();
  save(); // Persist the starter data on first run so later edits stick.

  // Initialize Firebase if available
  if (useFirebase) {
    initFirebase();
  }
})();
