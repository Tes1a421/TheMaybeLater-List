const STORAGE_KEY = "hover-todo-items-v1";
const ARCHIVE_DELAY = 10 * 60 * 1000;
const priorityOrder = {
  "important-urgent": 0,
  "not-important-urgent": 1,
  "important-not-urgent": 2,
  "not-important-not-urgent": 3
};

const priorityInfo = {
  "important-urgent": { label: "重要紧急", color: "#d85b52" },
  "important-not-urgent": { label: "重要不紧急", color: "#e1a54d" },
  "not-important-urgent": { label: "不重要紧急", color: "#6289b6" },
  "not-important-not-urgent": { label: "不重要不紧急", color: "#9ca4aa" }
};

const app = document.querySelector("#app");
const taskList = document.querySelector("#taskList");
const completedList = document.querySelector("#completedList");
const composer = document.querySelector("#composer");
const input = document.querySelector("#taskInput");
const commandPreview = document.querySelector("#commandPreview");
const prioritySelect = document.querySelector("#prioritySelect");
const dueDateInput = document.querySelector("#dueDateInput");
const dueDatePickerArea = document.querySelector("#dueDatePickerArea");
const dueTimeInput = document.querySelector("#dueTimeInput");
const dueTimePickerArea = document.querySelector("#dueTimePickerArea");
const composerSecondary = document.querySelector(".composer-secondary");
const timeWheelPopover = document.querySelector("#timeWheelPopover");
const timeWheelValue = document.querySelector("#timeWheelValue");
const hourWheel = document.querySelector("#hourWheel");
const minuteWheel = document.querySelector("#minuteWheel");
const reminderOffsetSelect = document.querySelector("#reminderOffsetSelect");
const completedWrap = document.querySelector("#completedWrap");
const reminderToast = document.querySelector("#reminderToast");
const reminderToastText = document.querySelector("#reminderToastText");
const settingsOverlay = document.querySelector("#settingsOverlay");
const openAtLoginInput = document.querySelector("#openAtLogin");
const workStartInput = document.querySelector("#workStartInput");
const workEndInput = document.querySelector("#workEndInput");

let items = loadItems();
let activeFilter = "all";
let pointerInside = false;
let editing = false;
let wheelScrollTimer;
let reminderWasEnabled = false;
const wheelStepState = new WeakMap();
let textAppliedDate = null;
let textAppliedTime = null;
let textAppliedReminder = null;
let hadDueDate = false;
let workSchedule = {
  start: "09:00",
  end: "18:00"
};

function currentRoundedTime() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(Math.round(now.getMinutes() / 5) * 5);
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function buildWheel(wheel, count, valueForIndex = (value) => value) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const value = valueForIndex(index);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = String(value);
    button.textContent = String(value).padStart(2, "0");
    fragment.appendChild(button);
  }
  wheel.appendChild(fragment);
}

function selectedWheelIndex(wheel, max) {
  return Math.max(0, Math.min(max - 1, Math.round(wheel.scrollTop / 32)));
}

function updateWheelSelection() {
  const hour = selectedWheelIndex(hourWheel, 24);
  const minuteIndex = selectedWheelIndex(minuteWheel, 12);
  const minute = minuteIndex * 5;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  dueTimeInput.value = value;
  timeWheelValue.textContent = value;
  [hourWheel, minuteWheel].forEach((wheel, wheelIndex) => {
    const selected = wheelIndex === 0 ? hour : minuteIndex;
    const previousState = wheelStepState.get(wheel);
    wheelStepState.set(wheel, {
      index: selected,
      lastAt: previousState?.lastAt || 0
    });
    wheel.querySelectorAll("button").forEach((button, index) => {
      button.classList.toggle("selected", index === selected);
    });
  });
}

function positionTimeWheels(behavior = "auto") {
  const [hour = 18, minute = 0] = dueTimeInput.value.split(":").map(Number);
  wheelStepState.set(hourWheel, { index: hour, lastAt: 0 });
  wheelStepState.set(minuteWheel, { index: Math.round(minute / 5), lastAt: 0 });
  hourWheel.scrollTo({ top: hour * 32, behavior });
  minuteWheel.scrollTo({ top: Math.round(minute / 5) * 32, behavior });
  setTimeout(updateWheelSelection, behavior === "smooth" ? 180 : 0);
}

function openTimeWheel() {
  if (dueTimeInput.disabled) return;
  editing = true;
  timeWheelPopover.classList.add("open");
  timeWheelPopover.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => positionTimeWheels());
}

function closeTimeWheel() {
  if (timeWheelPopover.classList.contains("open")) {
    updateWheelSelection();
  }
  timeWheelPopover.classList.remove("open");
  timeWheelPopover.setAttribute("aria-hidden", "true");
}

buildWheel(hourWheel, 24);
buildWheel(minuteWheel, 12, (index) => index * 5);
dueTimeInput.value = currentRoundedTime();
timeWheelValue.textContent = dueTimeInput.value;

function loadItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function formatReminder(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function formatDueDate(item) {
  if (!item.dueDate) return "";
  const date = new Date(`${item.dueDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function reminderOffsetLabel(value) {
  if (String(value).startsWith("work-end-")) {
    const minutes = Number(String(value).slice("work-end-".length));
    return `下班前${minutes}分钟`;
  }
  const labels = {
    "work-start": "上班时提醒",
    "0": "到期时提醒",
    "20": "提前20分钟",
    "60": "提前1小时",
    "120": "提前2小时",
    "1440": "提前1天",
    "4320": "提前3天",
    "10080": "提前7天",
    "20160": "提前14天"
  };
  return labels[String(value)] || "";
}

function calculateSchedule(dueDate, dueTime, reminderOffset) {
  if (!dueDate) return { dueAt: null, reminder: null };
  const workDueAt = `${dueDate}T${workSchedule.end}`;
  if (reminderOffset === "none") {
    return { dueAt: workDueAt, reminder: null };
  }
  if (reminderOffset === "work-start") {
    return {
      dueAt: workDueAt,
      reminder: new Date(`${dueDate}T${workSchedule.start}`).toISOString()
    };
  }
  if (String(reminderOffset).startsWith("work-end-")) {
    const minutesBeforeWorkEnd = Math.max(
      1,
      Number(String(reminderOffset).slice("work-end-".length)) || 30
    );
    const workEndTimestamp = new Date(workDueAt).getTime();
    return {
      dueAt: workDueAt,
      reminder: new Date(workEndTimestamp - minutesBeforeWorkEnd * 60 * 1000).toISOString()
    };
  }
  const dueAt = `${dueDate}T${dueTime || "18:00"}`;
  const dueTimestamp = new Date(dueAt).getTime();
  if (Number.isNaN(dueTimestamp)) return { dueAt, reminder: null };
  return {
    dueAt,
    reminder: new Date(dueTimestamp - Number(reminderOffset) * 60 * 1000).toISOString()
  };
}

function applyWorkScheduleToItems(migrateLegacyDateItems = false) {
  let changed = false;
  items.forEach((item) => {
    if (!item.dueDate || item.completedAt) return;
    let mode = item.reminderOffset;
    if (
      migrateLegacyDateItems &&
      (!mode || mode === "none") &&
      !item.scheduleMode &&
      !item.dueTime
    ) {
      mode = "work-start";
      item.reminderOffset = mode;
      item.scheduleMode = mode;
      item.notifiedAt = null;
      changed = true;
    }
    if (mode !== "work-start" && !String(mode).startsWith("work-end-")) return;
    const schedule = calculateSchedule(item.dueDate, null, mode);
    if (item.dueAt !== schedule.dueAt || item.reminder !== schedule.reminder) {
      item.dueAt = schedule.dueAt;
      item.reminder = schedule.reminder;
      changed = true;
    }
  });
  if (changed) saveItems();
}

function localDateValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function chineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9
  };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return [...value].reduce((number, character) => number * 10 + (digits[character] ?? 0), 0);
}

function roundedToFiveMinutes(date) {
  const result = new Date(date);
  result.setSeconds(0, 0);
  result.setMinutes(Math.round(result.getMinutes() / 5) * 5);
  return result;
}

function addMonthsClamped(date, count) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + count);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function parseTaskText(rawText) {
  const hashIndex = rawText.indexOf("#");
  if (hashIndex < 0) {
    return { hasDirectives: false, title: rawText.trim() };
  }

  const title = rawText.slice(0, hashIndex).trim();
  const directive = rawText.slice(hashIndex + 1).replaceAll("#", " ").trim();
  let priority = "not-important-not-urgent";

  if (/不重要\s*不紧急/.test(directive)) {
    priority = "not-important-not-urgent";
  } else if (/不重要\s*紧急/.test(directive)) {
    priority = "not-important-urgent";
  } else if (/重要\s*不紧急|重要不急/.test(directive)) {
    priority = "important-not-urgent";
  } else if (/不急|不紧急/.test(directive)) {
    priority = "not-important-not-urgent";
  } else if (/重要\s*紧急|重要急|急/.test(directive)) {
    priority = "important-urgent";
  }

  const now = new Date();
  let targetDate = new Date(now);
  let hasDate = false;
  let dueTime = null;
  const numberToken = "(\\d+|[一二两三四五六七八九十]+)";
  const workEndMinuteMatch = directive.match(
    new RegExp(`下班前\\s*${numberToken}\\s*分钟\\s*提醒(?:我)?`)
  );
  const reminderMode = workEndMinuteMatch
    ? `work-end-${Math.max(1, Math.min(720, chineseNumber(workEndMinuteMatch[1])))}`
    : /下班前\s*半(?:个)?小时\s*提醒(?:我)?|下班前\s*提醒(?:我)?/.test(directive)
      ? "work-end-30"
      : null;

  const minuteAfter = directive.match(new RegExp(`${numberToken}\\s*分钟后`));
  const hourAfter = directive.match(new RegExp(`${numberToken}\\s*(?:个)?小时后`));
  const halfHourAfter = /半(?:个)?小时后/.test(directive);

  if (minuteAfter || hourAfter || halfHourAfter) {
    const minutes = minuteAfter
      ? chineseNumber(minuteAfter[1])
      : hourAfter
        ? chineseNumber(hourAfter[1]) * 60
        : 30;
    targetDate = roundedToFiveMinutes(new Date(now.getTime() + minutes * 60 * 1000));
    hasDate = true;
    dueTime = `${String(targetDate.getHours()).padStart(2, "0")}:${String(targetDate.getMinutes()).padStart(2, "0")}`;
  } else {
    if (/下个月/.test(directive)) {
      targetDate = addMonthsClamped(now, 1);
      hasDate = true;
    } else if (/一周后|下周/.test(directive)) {
      targetDate.setDate(targetDate.getDate() + 7);
      hasDate = true;
    } else if (/大后天/.test(directive)) {
      targetDate.setDate(targetDate.getDate() + 3);
      hasDate = true;
    } else if (/后天/.test(directive)) {
      targetDate.setDate(targetDate.getDate() + 2);
      hasDate = true;
    } else if (/明天/.test(directive)) {
      targetDate.setDate(targetDate.getDate() + 1);
      hasDate = true;
    } else if (/今天/.test(directive)) {
      hasDate = true;
    } else {
      const dayAfter = directive.match(new RegExp(`${numberToken}\\s*天后`));
      const weekAfter = directive.match(new RegExp(`${numberToken}\\s*(?:个)?周后`));
      const monthAfter = directive.match(new RegExp(`${numberToken}\\s*(?:个)?月后`));
      if (dayAfter) {
        targetDate.setDate(targetDate.getDate() + chineseNumber(dayAfter[1]));
        hasDate = true;
      } else if (weekAfter) {
        targetDate.setDate(targetDate.getDate() + chineseNumber(weekAfter[1]) * 7);
        hasDate = true;
      } else if (monthAfter) {
        targetDate = addMonthsClamped(now, chineseNumber(monthAfter[1]));
        hasDate = true;
      }
    }

    const clockMatch = directive.match(
      /(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2}|[一二两三四五六七八九十]+)\s*[点时](?:\s*(半)|\s*(\d{1,2}|[一二两三四五六七八九十]+)\s*分?)?/
    );
    const colonMatch = directive.match(/(\d{1,2})[:：](\d{1,2})/);
    if (clockMatch || colonMatch) {
      let hour;
      let minute;
      if (colonMatch) {
        hour = Number(colonMatch[1]);
        minute = Number(colonMatch[2]);
      } else {
        hour = chineseNumber(clockMatch[2]);
        minute = clockMatch[3] ? 30 : clockMatch[4] ? chineseNumber(clockMatch[4]) : 0;
        const period = clockMatch[1] || "";
        if (/下午|晚上/.test(period) && hour < 12) hour += 12;
        if (/凌晨/.test(period) && hour === 12) hour = 0;
        if (/中午/.test(period) && hour < 11) hour += 12;
      }
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        minute = Math.round(minute / 5) * 5;
        if (minute === 60) {
          minute = 0;
          hour = (hour + 1) % 24;
          if (hour === 0) targetDate.setDate(targetDate.getDate() + 1);
        }
        dueTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        hasDate = true;
      }
    }
  }

  if (reminderMode && !hasDate) hasDate = true;

  return {
    hasDirectives: true,
    title,
    priority,
    dueDate: hasDate ? localDateValue(targetDate) : null,
    dueTime,
    reminderMode
  };
}

function setTextReminderOption(mode) {
  reminderOffsetSelect
    .querySelectorAll("option[data-text-directive]")
    .forEach((option) => option.remove());
  if (!mode) return;
  const existingOption = [...reminderOffsetSelect.options].find(
    (option) => option.value === mode
  );
  if (!existingOption) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = reminderOffsetLabel(mode);
    option.dataset.textDirective = "true";
    reminderOffsetSelect.appendChild(option);
  }
  reminderOffsetSelect.value = mode;
}

function previewTextDirectives() {
  const parsed = parseTaskText(input.value.trim());
  if (!parsed.hasDirectives) {
    if (textAppliedDate && dueDateInput.value === textAppliedDate) {
      dueDateInput.value = "";
    }
    if (textAppliedTime && dueTimeInput.value === textAppliedTime) {
      dueTimeInput.value = currentRoundedTime();
      timeWheelValue.textContent = dueTimeInput.value;
    }
    if (textAppliedReminder && reminderOffsetSelect.value === textAppliedReminder) {
      reminderOffsetSelect.value = "work-start";
    }
    setTextReminderOption(null);
    textAppliedDate = null;
    textAppliedTime = null;
    textAppliedReminder = null;
    syncScheduleControls();
    commandPreview.classList.remove("show");
    commandPreview.textContent = "";
    return;
  }

  if (parsed.dueDate) {
    dueDateInput.value = parsed.dueDate;
    textAppliedDate = parsed.dueDate;
  } else if (textAppliedDate && dueDateInput.value === textAppliedDate) {
    dueDateInput.value = "";
    textAppliedDate = null;
  }

  if (parsed.dueTime) {
    dueTimeInput.value = parsed.dueTime;
    timeWheelValue.textContent = parsed.dueTime;
    textAppliedTime = parsed.dueTime;
  } else if (textAppliedTime && dueTimeInput.value === textAppliedTime) {
    dueTimeInput.value = currentRoundedTime();
    timeWheelValue.textContent = dueTimeInput.value;
    textAppliedTime = null;
  }

  if (parsed.reminderMode) {
    setTextReminderOption(parsed.reminderMode);
    textAppliedReminder = parsed.reminderMode;
  } else if (textAppliedReminder && reminderOffsetSelect.value === textAppliedReminder) {
    reminderOffsetSelect.value = "work-start";
    setTextReminderOption(null);
    textAppliedReminder = null;
  }

  prioritySelect.value = parsed.priority;
  syncScheduleControls();

  const parts = [priorityInfo[parsed.priority].label];
  if (parsed.dueDate) parts.push(parsed.dueDate);
  if (parsed.dueTime) parts.push(parsed.dueTime);
  if (parsed.reminderMode) parts.push(reminderOffsetLabel(parsed.reminderMode));
  commandPreview.textContent = parts.join(" · ");
  commandPreview.classList.add("show");
}

function syncScheduleControls() {
  const hasDueDate = Boolean(dueDateInput.value);
  if (hasDueDate && !hadDueDate && reminderOffsetSelect.value === "none") {
    reminderOffsetSelect.value = "work-start";
  }
  if (!hasDueDate) reminderOffsetSelect.value = "none";
  const hasReminder = reminderOffsetSelect.value !== "none";
  const needsCustomTime =
    hasReminder &&
    reminderOffsetSelect.value !== "work-start" &&
    !String(reminderOffsetSelect.value).startsWith("work-end-");
  if (needsCustomTime && !reminderWasEnabled) {
    dueTimeInput.value = currentRoundedTime();
    timeWheelValue.textContent = dueTimeInput.value;
  }
  reminderOffsetSelect.disabled = !hasDueDate;
  dueTimeInput.disabled = !hasDueDate || !needsCustomTime;
  dueTimePickerArea.classList.toggle("hidden", !needsCustomTime);
  composerSecondary.classList.toggle("no-time", !needsCustomTime);
  if (!needsCustomTime) closeTimeWheel();
  reminderWasEnabled = needsCustomTime;
  hadDueDate = hasDueDate;
}

function isArchived(item) {
  return item.completedAt && Date.now() - item.completedAt >= ARCHIVE_DELAY;
}

function isOverdue(item) {
  if (item.completedAt) return false;
  const dueValue =
    item.dueAt ||
    (item.dueDate ? `${item.dueDate}T${item.dueTime || "18:00"}` : item.reminder);
  if (!dueValue) return false;
  const dueTime = new Date(dueValue).getTime();
  return !Number.isNaN(dueTime) && dueTime < Date.now();
}

function dueTimestamp(item) {
  const dueValue =
    item.dueAt ||
    (item.dueDate ? `${item.dueDate}T${item.dueTime || "18:00"}` : item.reminder);
  const value = dueValue ? new Date(dueValue).getTime() : NaN;
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function taskTemplate(item) {
  const info = priorityInfo[item.priority];
  return `
    <article class="task ${item.completedAt ? "done" : ""} ${isOverdue(item) ? "overdue" : ""}" data-id="${item.id}">
      <input class="check" type="checkbox" ${item.completedAt ? "checked" : ""} aria-label="完成事项">
      <div class="task-body">
        <div class="task-title">${escapeHtml(item.title)}</div>
        <div class="task-meta">
          ${isOverdue(item) ? `<span class="overdue-pill">已逾期</span>` : ""}
          <span class="priority-pill" style="--pill:${info.color}">${info.label}</span>
          ${item.dueDate ? `<span class="due-meta">完成 ${formatDueDate(item)}</span>` : ""}
          ${item.dueDate && item.dueTime ? `<span>${item.dueTime}</span>` : ""}
          ${
            item.reminderOffset && item.reminderOffset !== "none"
              ? `<span class="reminder-meta">◷ ${reminderOffsetLabel(item.reminderOffset)}</span>`
              : !item.dueDate && item.reminder
                ? `<span>◷ ${formatReminder(item.reminder)}</span>`
                : ""
          }
          ${item.completedAt && !isArchived(item) ? "<span>10 分钟后归档</span>" : ""}
        </div>
      </div>
      <button class="delete" title="删除事项" aria-label="删除事项">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/>
        </svg>
      </button>
    </article>`;
}

function render() {
  const filtered = items.filter((item) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "overdue") return isOverdue(item);
    return item.priority === activeFilter;
  });
  const active = filtered.filter((item) => !isArchived(item));
  const archived = filtered.filter(isArchived);
  const sortTasks = (a, b) => {
    if (activeFilter === "all") {
      const overdueDifference = Number(isOverdue(b)) - Number(isOverdue(a));
      if (overdueDifference !== 0) return overdueDifference;
      const priorityDifference = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDifference !== 0) return priorityDifference;
    }
    if (activeFilter === "overdue") {
      return dueTimestamp(a) - dueTimestamp(b);
    }
    return b.createdAt - a.createdAt;
  };

  taskList.innerHTML = active.length
    ? active.sort(sortTasks).map(taskTemplate).join("")
    : `<div class="empty">这里暂时没有事项</div>`;
  completedList.innerHTML = archived.sort(sortTasks).map(taskTemplate).join("");
  completedWrap.style.display = archived.length ? "" : "none";

  document.querySelector("#activeCount").textContent = `${active.filter((item) => !item.completedAt).length} 项`;
  document.querySelector("#completedCount").textContent = archived.length;
  document.querySelector("#peekCount").textContent = items.filter((item) => !item.completedAt).length;

  const counts = {
    all: items.filter((item) => !item.completedAt).length,
    overdue: items.filter(isOverdue).length
  };
  Object.keys(priorityInfo).forEach((key) => {
    counts[key] = items.filter((item) => item.priority === key && !item.completedAt).length;
  });
  Object.entries(counts).forEach(([key, value]) => {
    document.querySelector(`#count-${key}`).textContent = value;
  });
}

function animateTaskLists() {
  const keyframes = [
    { opacity: 0, transform: "translateY(7px)" },
    { opacity: 1, transform: "translateY(0)" }
  ];
  const options = {
    duration: 190,
    easing: "cubic-bezier(.2, .75, .25, 1)",
    fill: "both"
  };
  taskList.animate(keyframes, options);
  if (completedList.children.length) {
    completedList.animate(keyframes, { ...options, delay: 35 });
  }
}

function addTask(event) {
  event.preventDefault();
  const parsedText = parseTaskText(input.value.trim());
  const title = parsedText.title;
  if (!title) {
    input.focus();
    return;
  }
  const selectedDate = parsedText.dueDate || dueDateInput.value;
  let reminderMode = parsedText.reminderMode || reminderOffsetSelect.value;
  if (parsedText.dueDate && reminderMode === "none") reminderMode = "work-start";
  if (parsedText.dueTime && !parsedText.reminderMode && reminderMode === "work-start") {
    reminderMode = "none";
  }
  if (reminderMode !== "none" && !selectedDate) {
    dueDateInput.focus();
    if (typeof dueDateInput.showPicker === "function") {
      try {
        dueDateInput.showPicker();
      } catch {
        // 日期控件不可主动展开时保留焦点供用户选择。
      }
    }
    return;
  }
  const hasReminder = reminderMode !== "none";
  const needsCustomTime =
    hasReminder &&
    reminderMode !== "work-start" &&
    !String(reminderMode).startsWith("work-end-");
  const hasTextTime = Boolean(parsedText.dueTime);
  const selectedDueTime =
    parsedText.dueTime ||
    (needsCustomTime ? dueTimeInput.value || currentRoundedTime() : null);
  const schedule = calculateSchedule(
    selectedDate,
    selectedDueTime,
    reminderMode
  );
  if (!hasReminder && hasTextTime && selectedDate) {
    schedule.dueAt = `${selectedDate}T${selectedDueTime}`;
  }
  items.unshift({
    id: crypto.randomUUID(),
    title,
    priority: parsedText.hasDirectives ? parsedText.priority : prioritySelect.value,
    dueDate: selectedDate || null,
    dueTime: selectedDate && (needsCustomTime || hasTextTime) ? selectedDueTime : null,
    dueAt: schedule.dueAt,
    reminderOffset: reminderMode,
    scheduleMode: reminderMode === "none" ? "none-explicit" : reminderMode,
    reminder: schedule.reminder,
    notifiedAt: null,
    createdAt: Date.now(),
    completedAt: null
  });
  saveItems();
  input.value = "";
  commandPreview.classList.remove("show");
  commandPreview.textContent = "";
  textAppliedDate = null;
  textAppliedTime = null;
  textAppliedReminder = null;
  dueDateInput.value = "";
  dueTimeInput.value = currentRoundedTime();
  reminderOffsetSelect.value = "none";
  setTextReminderOption(null);
  syncScheduleControls();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  editing = false;
  render();
}

function handleTaskAction(event) {
  const task = event.target.closest(".task");
  if (!task) return;
  const item = items.find((candidate) => candidate.id === task.dataset.id);
  if (!item) return;

  if (event.target.closest(".delete")) {
    items = items.filter((candidate) => candidate.id !== item.id);
  } else if (event.target.matches(".check")) {
    item.completedAt = event.target.checked ? Date.now() : null;
  } else {
    return;
  }
  saveItems();
  render();
}

document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long", day: "numeric", weekday: "short"
}).format(new Date());

app.addEventListener("mouseenter", () => {
  pointerInside = true;
  window.desktop.setHover(true);
});
app.addEventListener("mouseleave", () => {
  pointerInside = false;
  if (!editing) window.desktop.setHover(false);
});

composer.addEventListener("focusin", () => {
  editing = true;
  window.desktop.setHover(true);
});
composer.addEventListener("focusout", () => {
  // 等待焦点从一个编辑控件转移到另一个编辑控件后再判断，
  // 同时兼容输入法候选窗和原生日期选择器。
  setTimeout(() => {
    editing = composer.contains(document.activeElement);
    if (!editing && !pointerInside) window.desktop.setHover(false);
  }, 120);
});

window.addEventListener("blur", () => {
  // 点击桌面或其他应用时，浏览器可能仍把输入框保留为 activeElement。
  // 此处主动解除编辑锁，确保空白的新建事项也能正常收起。
  editing = false;
  pointerInside = false;
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  window.desktop.setHover(false);
});

window.desktop.onWindowState((expanded, transitionId) => {
  app.classList.toggle("collapsed", !expanded);
  // 等浏览器完成布局和绘制后，再通知主进程显示透明窗口，
  // 避免 Windows 在调整窗口边界时露出旧帧。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.desktop.renderReady(transitionId));
  });
});
window.desktop.onOpenSettings(() => openSettings());
document.querySelector("#closeButton").addEventListener("click", () => window.desktop.close());
document.querySelector("#settingsButton").addEventListener("click", openSettings);
document.querySelector("#settingsClose").addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) closeSettings();
});
document.querySelector("#saveSettings").addEventListener("click", async () => {
  const closeAction = document.querySelector('input[name="closeAction"]:checked')?.value || "hide";
  const workStart = workStartInput.value || "09:00";
  const workEnd = workEndInput.value || "18:00";
  if (workStart >= workEnd) {
    workEndInput.setCustomValidity("下班时间必须晚于上班时间");
    workEndInput.reportValidity();
    return;
  }
  workEndInput.setCustomValidity("");
  const savedSettings = await window.desktop.saveSettings({
    openAtLogin: openAtLoginInput.checked,
    closeAction,
    workStart,
    workEnd
  });
  workSchedule = {
    start: savedSettings.workStart || "09:00",
    end: savedSettings.workEnd || "18:00"
  };
  applyWorkScheduleToItems();
  checkReminders();
  render();
  closeSettings();
});
document.querySelector("#filters").addEventListener("click", (event) => {
  const button = event.target.closest(".filter");
  if (!button) return;
  document.querySelectorAll(".filter").forEach((filter) => filter.classList.remove("active"));
  button.classList.add("active");
  activeFilter = button.dataset.filter;
  document.querySelector("#sectionTitle").textContent =
    activeFilter === "all"
      ? "进行中"
      : activeFilter === "overdue"
        ? "已逾期"
        : priorityInfo[activeFilter].label;
  render();
  animateTaskLists();
});
composer.addEventListener("submit", addTask);
input.addEventListener("input", previewTextDirectives);
dueDatePickerArea.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  dueDateInput.focus();
  if (typeof dueDateInput.showPicker === "function") {
    try {
      dueDateInput.showPicker();
    } catch {
      // Chromium 不支持主动展开时仍保留原生输入行为。
    }
  }
});
dueDateInput.addEventListener("change", syncScheduleControls);
reminderOffsetSelect.addEventListener("change", syncScheduleControls);
dueTimePickerArea.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || dueTimeInput.disabled) return;
  event.preventDefault();
  dueTimeInput.focus();
  openTimeWheel();
});
[hourWheel, minuteWheel].forEach((wheel) => {
  wheel.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const now = performance.now();
      const max = wheel === minuteWheel ? 12 : 24;
      const previous = wheelStepState.get(wheel) || {
        index: selectedWheelIndex(wheel, max),
        lastAt: 0
      };

      // Windows 一次滚轮刻度可能产生较大的像素位移；
      // 在这里统一压缩成一个选项，避免一次跳过多个时刻。
      if (now - previous.lastAt < 70) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(max - 1, previous.index + direction));
      wheelStepState.set(wheel, { index: nextIndex, lastAt: now });
      wheel.scrollTo({ top: nextIndex * 32, behavior: "smooth" });
      clearTimeout(wheelScrollTimer);
      wheelScrollTimer = setTimeout(updateWheelSelection, 140);
    },
    { passive: false }
  );
  wheel.addEventListener("scroll", () => {
    clearTimeout(wheelScrollTimer);
    wheelScrollTimer = setTimeout(updateWheelSelection, 70);
  });
  wheel.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const value = Number(button.dataset.value);
    const wheelIndex = wheel === minuteWheel ? value / 5 : value;
    wheelStepState.set(wheel, { index: wheelIndex, lastAt: performance.now() });
    wheel.scrollTo({
      top: wheelIndex * 32,
      behavior: "smooth"
    });
  });
});
document.querySelector("#timeWheelConfirm").addEventListener("click", closeTimeWheel);
document.addEventListener("pointerdown", (event) => {
  if (
    timeWheelPopover.classList.contains("open") &&
    !timeWheelPopover.contains(event.target) &&
    !dueTimePickerArea.contains(event.target)
  ) {
    closeTimeWheel();
  }
});
taskList.addEventListener("click", handleTaskAction);
completedList.addEventListener("click", handleTaskAction);
document.querySelector("#completedToggle").addEventListener("click", () => completedWrap.classList.toggle("closed"));

setInterval(render, 30 * 1000);

function checkReminders() {
  let changed = false;
  const now = Date.now();
  items.forEach((item) => {
    if (
      item.reminder &&
      !item.notifiedAt &&
      !item.completedAt &&
      new Date(item.reminder).getTime() <= now
    ) {
      window.desktop.notify("小羊鸽单 · 事项提醒", item.title);
      reminderToastText.textContent = item.title;
      reminderToast.classList.add("show");
      item.notifiedAt = now;
      changed = true;
    }
  });
  if (changed) {
    saveItems();
    render();
  }
}

setInterval(checkReminders, 15 * 1000);
document.querySelector("#dismissToast").addEventListener("click", () => {
  reminderToast.classList.remove("show");
});
syncScheduleControls();
render();
window.desktop.getSettings().then((settings) => {
  workSchedule = {
    start: settings.workStart || "09:00",
    end: settings.workEnd || "18:00"
  };
  applyWorkScheduleToItems(true);
  checkReminders();
  render();
});

async function openSettings() {
  editing = true;
  window.desktop.setHover(true);
  const settings = await window.desktop.getSettings();
  openAtLoginInput.checked = Boolean(settings.openAtLogin);
  workStartInput.value = settings.workStart || "09:00";
  workEndInput.value = settings.workEnd || "18:00";
  const actionInput = document.querySelector(
    `input[name="closeAction"][value="${settings.closeAction === "quit" ? "quit" : "hide"}"]`
  );
  actionInput.checked = true;
  settingsOverlay.classList.add("open");
  settingsOverlay.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  settingsOverlay.classList.remove("open");
  settingsOverlay.setAttribute("aria-hidden", "true");
  editing = false;
}
