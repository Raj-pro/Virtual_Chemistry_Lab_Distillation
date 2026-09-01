const state = {
  mode: "free", placed: new Set(), flaskFilled: false, waterMeasured: false, acetoneMeasured: false,
  thermometerCorrect: false, condenserConnected: false, waterInletConnected: false, waterOutletConnected: false,
  coolingActive: false, burnerActive: false, heatIntensity: 0, temperature: 24, acetoneFraction: 0.5,
  distillateVolume: 0, firstComponentObserved: false, secondComponentObserved: false, experimentCompleted: false,
  started: false, demoRunning: false, demoTimer: null, demoStep: 0, observationsChecked: false
};

const equipment = [
  ["flask", "⚗️", "Round bottom flask (250 mL)"],
  ["cork", "▰", "Corks (flask & joint)"],
  ["thermometer", "🌡", "Thermometer (-10–110 °C)"],
  ["stand", "▥", "Clamp stands"],
  ["clamp", "⌁", "Laboratory clamps"],
  ["condenser", "▱", "Water condenser (Liebig)"],
  ["tube", "〰", "Water tubing"],
  ["tripod", "△", "Tripod stand"],
  ["gauze", "▦", "Wire gauze"],
  ["burner", "♨", "Bunsen burner"],
  ["beaker", "▱", "Receiving beaker (250 mL)"],
  ["cylinder", "▯", "Measuring cylinder"],
  ["acetone", "💧", "Acetone (50 mL)"],
  ["water", "💧", "Water (50 mL)"]
];

const targetMap = {
  flask: "flask",
  cork: "cork",
  thermometer: "thermometer",
  stand: "stand",
  clamp: "clamp",
  condenser: "condenser",
  tripod: "tripod",
  gauze: "gauze",
  burner: "burner",
  beaker: "beaker"
};

const placementHints = {
  flask: "Drop the round bottom flask above the wire gauze, centered over the burner.",
  cork: "Drop the cork on the flask mouth and condenser joint.",
  thermometer: "Drop the thermometer through the flask cork with its bulb beside the side arm.",
  stand: "Drop the clamp stand on the left support base.",
  clamp: "Drop the clamp where it holds the flask neck.",
  condenser: "Drop the condenser on the angled side-arm path toward the beaker.",
  tripod: "Drop the tripod around the burner.",
  gauze: "Drop the wire gauze on top of the tripod.",
  burner: "Drop the burner beneath the wire gauze.",
  beaker: "Drop the receiving beaker at the condenser outlet.",
  tube: "Drop the tubing on the condenser to connect cold water in and hot water out."
};

const equipmentButtons = new Map();
let dragSession = null;
let nativeDragItem = null;

const steps = [
  "Prepare mixture (50 mL water + 50 mL acetone)",
  "Assemble apparatus (Fig 15.1)",
  "Connect cold water into condenser",
  "Ignite burner & heat slowly",
  "Observe Component I distillation (Acetone ~56 °C)",
  "Collect distillate in receiving beaker",
  "Observe Component II distillation (Water ~100 °C)",
  "Record observations in notebook",
  "Review results & conclusion"
];

const demoSteps = [
  { label: "Measure water", run: () => measure("water", 50) },
  { label: "Measure acetone", run: () => measure("acetone", 50) },
  { label: "Place support stand and clamp", run: () => ["stand", "clamp"].forEach(id => place(id, id)) },
  { label: "Place tripod, wire gauze, and burner", run: () => ["tripod", "gauze", "burner"].forEach(id => place(id, id)) },
  { label: "Place flask, corks, and thermometer", run: () => ["flask", "cork", "thermometer"].forEach(id => place(id, id)) },
  { label: "Attach condenser and receiving beaker", run: () => ["condenser", "beaker"].forEach(id => place(id, id)) },
  {
    label: "Connect water tubing",
    run: () => {
      state.placed.add("tube");
      state.waterInletConnected = true;
      state.waterOutletConnected = true;
      markToolPlaced("tube");
      msg("Rubber tubing connected: cold water IN at lower nozzle, hot water OUT at upper nozzle.");
      updateUI();
    }
  },
  { label: "Start condenser cooling water", run: () => setCooling(true) },
  { label: "Ignite burner and heat slowly", run: () => setBurner(true, 50) }
];

const tray = document.getElementById("tray");
const lab = document.getElementById("lab");
const toast = document.getElementById("toast");

equipment.forEach(([id, icon, name]) => {
  const b = document.createElement("button");
  b.className = "tool";
  b.dataset.item = id;
  b.type = "button";
  b.setAttribute("aria-label", `${name}. Drag to the lab bench or press Enter to place.`);
  b.innerHTML = `<span class="icon">${icon}</span><span>${name}</span>`;
  b.draggable = true;
  b.addEventListener("dragstart", e => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    beginNativeDrag(id);
  });
  b.addEventListener("dragend", () => {
    nativeDragItem = null;
    clearDropFeedback();
  });
  b.addEventListener("pointerdown", e => beginPointerDrag(e, id, b));
  b.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectTool(id, { source: "keyboard" });
    }
  });
  equipmentButtons.set(id, b);
  tray.appendChild(b);
});

steps.forEach((s, i) => {
  const d = document.createElement("div");
  d.className = "step";
  d.id = "step" + i;
  d.textContent = "○ " + s;
  document.getElementById("steps").appendChild(d);
});

function msg(t) {
  document.getElementById("labMessage").textContent = t;
}

function showToast(t) {
  toast.textContent = t;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 2600);
}

function getDropTargetForItem(item) {
  if (item === "tube") return "condenser";
  return targetMap[item] || null;
}

function getReadableItemName(item) {
  const found = equipment.find(([id]) => id === item);
  return found ? found[2] : item;
}

function clearDropFeedback() {
  lab.classList.remove("is-dragging", "can-drop", "cannot-drop");
  document.querySelectorAll(".drop-ready, .drop-match, .drop-mismatch, .tool-cue").forEach(el => {
    el.classList.remove("drop-ready", "drop-match", "drop-mismatch", "tool-cue");
  });
}

function beginNativeDrag(item) {
  nativeDragItem = item;
  clearDropFeedback();
  lab.classList.add("is-dragging");
  const targetId = getDropTargetForItem(item);
  if (targetId) {
    const target = document.getElementById(targetId);
    if (target) target.classList.add("drop-ready");
  }
  msg(placementHints[item] || `Place ${getReadableItemName(item)} on the bench.`);
}

function getClosestDropTarget(clientX, clientY) {
  const candidates = Array.from(document.querySelectorAll(".apparatus-group.target"));
  let best = null;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(clientX - centerX, clientY - centerY);
    const radius = Math.max(48, Math.min(150, Math.max(rect.width, rect.height) * 0.65));
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { el, id: el.dataset.target || el.id, distance };
    }
  }
  return best;
}

function previewDrop(item, clientX, clientY) {
  document.querySelectorAll(".drop-match, .drop-mismatch").forEach(el => {
    el.classList.remove("drop-match", "drop-mismatch");
  });

  const labRect = lab.getBoundingClientRect();
  const overLab = clientX >= labRect.left && clientX <= labRect.right && clientY >= labRect.top && clientY <= labRect.bottom;
  const closest = overLab ? getClosestDropTarget(clientX, clientY) : null;
  const expected = getDropTargetForItem(item);
  const matched = closest && closest.id === expected;

  lab.classList.toggle("can-drop", Boolean(matched));
  lab.classList.toggle("cannot-drop", Boolean(overLab && !matched));

  if (closest) closest.el.classList.add(matched ? "drop-match" : "drop-mismatch");
  return matched ? closest.id : null;
}

function beginPointerDrag(e, item, button) {
  if (e.button !== 0 && e.pointerType === "mouse") return;

  dragSession = {
    item,
    button,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    ghost: null
  };
  button.setPointerCapture?.(e.pointerId);
  button.addEventListener("pointermove", movePointerDrag);
  button.addEventListener("pointerup", endPointerDrag);
  button.addEventListener("pointercancel", cancelPointerDrag);
}

function createDragGhost(button, item) {
  const ghost = button.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${button.offsetWidth}px`;
  document.body.appendChild(ghost);
  beginNativeDrag(item);
  return ghost;
}

function movePointerDrag(e) {
  if (!dragSession || dragSession.pointerId !== e.pointerId) return;
  const dx = e.clientX - dragSession.startX;
  const dy = e.clientY - dragSession.startY;
  if (!dragSession.active && Math.hypot(dx, dy) > 6) {
    dragSession.active = true;
    dragSession.ghost = createDragGhost(dragSession.button, dragSession.item);
  }
  if (!dragSession.active) return;
  e.preventDefault();
  dragSession.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
  previewDrop(dragSession.item, e.clientX, e.clientY);
}

function endPointerDrag(e) {
  if (!dragSession || dragSession.pointerId !== e.pointerId) return;
  const { item, active, ghost, button } = dragSession;
  button.releasePointerCapture?.(e.pointerId);
  button.removeEventListener("pointermove", movePointerDrag);
  button.removeEventListener("pointerup", endPointerDrag);
  button.removeEventListener("pointercancel", cancelPointerDrag);
  dragSession = null;

  if (ghost) ghost.remove();
  if (active) {
    e.preventDefault();
    const targetId = previewDrop(item, e.clientX, e.clientY);
    clearDropFeedback();
    if (targetId) {
      selectTool(item, { targetId, source: "drag" });
    } else {
      const expected = getDropTargetForItem(item);
      msg(expected ? placementHints[item] : `${getReadableItemName(item)} is used from the tray.`);
      showToast("Drop it on the highlighted correct apparatus position.");
    }
    return;
  }

  clearDropFeedback();
  selectTool(item, { source: "click" });
}

function cancelPointerDrag(e) {
  if (!dragSession || dragSession.pointerId !== e.pointerId) return;
  dragSession.ghost?.remove();
  dragSession.button.removeEventListener("pointermove", movePointerDrag);
  dragSession.button.removeEventListener("pointerup", endPointerDrag);
  dragSession.button.removeEventListener("pointercancel", cancelPointerDrag);
  dragSession = null;
  clearDropFeedback();
}

function markToolPlaced(item) {
  const button = equipmentButtons.get(item);
  if (!button) return;
  button.classList.add("placed");
  button.setAttribute("aria-pressed", "true");
}

function showPlacementCue(item) {
  clearDropFeedback();
  const targetId = getDropTargetForItem(item);
  const target = targetId ? document.getElementById(targetId) : null;
  const button = equipmentButtons.get(item);

  if (target) target.classList.add("drop-ready");
  if (button) button.classList.add("tool-cue");

  msg(`${getReadableItemName(item)} belongs here. Drag it from the tray and drop it on the highlighted position.`);
  showToast(`Drag ${getReadableItemName(item)} to the highlighted position.`);

  clearTimeout(showPlacementCue.t);
  showPlacementCue.t = setTimeout(clearDropFeedback, 3500);
}

function place(item, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  state.placed.add(item);
  target.classList.add("is-placed");
  markToolPlaced(item);
  target.classList.add("snap");
  setTimeout(() => target.classList.remove("snap"), 350);

  if (item === "flask") msg("Round bottom flask placed on wire gauze. Now add 50 mL acetone + 50 mL water.");
  if (item === "thermometer") {
    state.thermometerCorrect = true;
    msg("Thermometer inserted through cork with bulb placed level with the side-arm branch.");
  }
  if (item === "condenser") {
    state.placed.add("condenser");
    state.condenserConnected = true;
    msg("Water condenser attached to distillation flask side-arm via cork joint.");
  }
  if (item === "tripod") state.placed.add("tripod");
  if (item === "gauze") state.placed.add("gauze");
  if (item === "burner") state.placed.add("burner");
  if (item === "beaker") state.placed.add("beaker");
  if (item === "stand") state.placed.add("stand");
  if (item === "clamp") state.placed.add("clamp");
  if (item === "cork") state.placed.add("cork");

  updateUI();
}

function selectTool(item, options = {}) {
  if (item === "water" || item === "acetone") {
    measure(item);
    return;
  }
  if (item === "cylinder") {
    state.placed.add("cylinder");
    markToolPlaced("cylinder");
    msg("Measuring cylinder selected. Use it to measure 50 mL water and 50 mL acetone.");
    updateUI();
    return;
  }
  if (item === "tube") {
    if (options.source !== "drag") {
      showPlacementCue(item);
      return;
    }
    const targetId = options.targetId || "condenser";
    if (options.source === "drag" && targetId !== "condenser") {
      msg("Tubing belongs on the condenser water ports.");
      return;
    }
    msg("Rubber tubing connected: cold water IN at lower nozzle, hot water OUT at upper nozzle.");
    state.placed.add("tube");
    state.waterInletConnected = true;
    state.waterOutletConnected = true;
    markToolPlaced("tube");
    updateUI();
    return;
  }
  if (targetMap[item]) {
    const expected = targetMap[item];
    const targetId = options.targetId || expected;
    if (options.source !== "drag") {
      showPlacementCue(item);
      return;
    }
    if (options.source === "drag" && targetId !== expected) {
      msg(`${getReadableItemName(item)} is not placed there. ${placementHints[item]}`);
      showToast("Try the highlighted matching position.");
      return;
    }
    place(item, expected);
  }
}

lab.addEventListener("dragover", e => {
  e.preventDefault();
  const item = e.dataTransfer.getData("text/plain") || nativeDragItem;
  if (item) {
    e.dataTransfer.dropEffect = previewDrop(item, e.clientX, e.clientY) ? "move" : "none";
  }
});
lab.addEventListener("dragleave", e => {
  if (!lab.contains(e.relatedTarget)) clearDropFeedback();
});
lab.addEventListener("drop", e => {
  e.preventDefault();
  const item = e.dataTransfer.getData("text/plain") || nativeDragItem;
  const targetId = previewDrop(item, e.clientX, e.clientY);
  nativeDragItem = null;
  clearDropFeedback();
  if (targetId) selectTool(item, { targetId, source: "drag" });
  else {
    msg(placementHints[item] || "Use this item from the tray.");
    showToast("Drop it on the correct highlighted apparatus position.");
  }
});

// Setup click on SVG apparatus elements directly
document.querySelectorAll(".apparatus-group.target").forEach(el => {
  el.addEventListener("click", () => {
    const id = el.dataset.target || el.id;
    showPlacementCue(id);
  });
});

function measure(liquid, presetVolume = null) {
  const v = presetVolume ?? prompt(`Measure ${liquid.toUpperCase()} — enter volume in mL (48–52 mL recommended):`, "50");
  if (v === null) return;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    showToast("Please enter a valid numeric volume in mL.");
    return;
  }
  if (n > 65) {
    msg("Too much liquid measured. Flask should not be filled beyond two-thirds full.");
    return;
  }
  if (liquid === "water") {
    state.waterMeasured = n >= 45 && n <= 55;
    state.waterVolume = n;
    if (state.waterMeasured) {
      state.placed.add("water");
      markToolPlaced("water");
    }
  } else {
    state.acetoneMeasured = n >= 45 && n <= 55;
    state.acetoneVolume = n;
    if (state.acetoneMeasured) {
      state.placed.add("acetone");
      markToolPlaced("acetone");
    }
  }

  if (state.waterMeasured && state.acetoneMeasured) {
    state.flaskFilled = true;
    state.placed.add("flask");
    markToolPlaced("flask");
    msg("Mixture of 50 mL water and 50 mL acetone is now in the round bottom flask.");
    const liquidPath = document.getElementById("liquid");
    if (liquidPath) {
      liquidPath.setAttribute("d", "M 224 235 C 224 290 244 300 270 300 C 296 300 316 290 316 235 C 300 232 240 232 224 235 Z");
    }
  } else {
    msg(`${liquid.toUpperCase()} measured (${n} mL). Now measure the remaining component (50 mL).`);
  }
  updateUI();
}

function setCooling(active) {
  if (!state.placed.has("condenser")) {
    place("condenser", "condenser");
  }
  state.waterInletConnected = active;
  state.waterOutletConnected = active;
  state.condenserConnected = active;
  state.coolingActive = active;
  const condenserEl = document.getElementById("condenser");
  if (condenserEl) condenserEl.classList.toggle("cooling", state.coolingActive);
  const coolingBtn = document.getElementById("cooling");
  if (coolingBtn) coolingBtn.textContent = state.coolingActive ? "Stop cooling water" : "Start cooling water";
  msg(state.coolingActive ? "Cooling water circulating: Cold water in at bottom, hot water out at top." : "Cooling water stopped.");
  updateUI();
}

function setBurner(active, intensity = 50) {
  if (active && !state.flaskFilled) {
    state.flaskFilled = true;
    state.waterMeasured = true;
    state.acetoneMeasured = true;
    state.placed.add("water");
    state.placed.add("acetone");
    state.placed.add("flask");
    markToolPlaced("water");
    markToolPlaced("flask");
    const liquidPath = document.getElementById("liquid");
    if (liquidPath) {
      liquidPath.setAttribute("d", "M 224 235 C 224 290 244 300 270 300 C 296 300 316 290 316 235 C 300 232 240 232 224 235 Z");
    }
  }
  state.burnerActive = active;
  const flame = document.getElementById("flame");
  if (flame) flame.classList.toggle("on", state.burnerActive);
  state.started = state.burnerActive;
  const igniteBtn = document.getElementById("ignite");
  if (igniteBtn) igniteBtn.textContent = state.burnerActive ? "🔥 Extinguish burner" : "🔥 Ignite burner";
  state.heatIntensity = active ? intensity : 0;
  const heatSlider = document.getElementById("heat");
  if (heatSlider) heatSlider.value = state.heatIntensity;
  const heatOut = document.getElementById("heatOut");
  if (heatOut) heatOut.textContent = state.heatIntensity + "%";
  msg(active ? "Burner ignited. Heat the mixture slowly and monitor the thermometer." : "Burner extinguished.");
  updateUI();
}

document.getElementById("cooling").onclick = () => {
  if (!state.placed.has("condenser")) {
    msg("Place the water condenser before turning on cooling water.");
    return;
  }
  setCooling(!state.coolingActive);
};

document.getElementById("ignite").onclick = () => {
  if (!state.flaskFilled) {
    msg("Prepare the solution of acetone and water in the flask first.");
    return;
  }
  if (!state.placed.has("burner") || !state.placed.has("gauze") || !state.placed.has("tripod")) {
    msg("Ensure the Bunsen burner, wire gauze, and tripod are in place before heating.");
    return;
  }
  const nextActive = !state.burnerActive;
  const targetIntensity = nextActive ? (state.heatIntensity || 45) : 0;
  setBurner(nextActive, targetIntensity);
};

document.getElementById("heat").oninput = e => {
  state.heatIntensity = +e.target.value;
  document.getElementById("heatOut").textContent = state.heatIntensity + "%";
  updateUI();
};

function resetExperimentState() {
  stopDemo();
  state.placed.clear();
  state.flaskFilled = false;
  state.waterMeasured = false;
  state.acetoneMeasured = false;
  state.thermometerCorrect = false;
  state.condenserConnected = false;
  state.waterInletConnected = false;
  state.waterOutletConnected = false;
  state.coolingActive = false;
  state.burnerActive = false;
  state.heatIntensity = 0;
  state.temperature = 24;
  state.acetoneFraction = 0.5;
  state.distillateVolume = 0;
  state.firstComponentObserved = false;
  state.secondComponentObserved = false;
  state.experimentCompleted = false;
  state.started = false;
  state.observationsChecked = false;

  document.querySelectorAll(".apparatus-group").forEach(el => el.classList.remove("is-placed", "snap", "cooling"));
  document.getElementById("flame")?.classList.remove("on");

  const distillateLiquid = document.getElementById("distillateLiquid");
  if (distillateLiquid) {
    distillateLiquid.setAttribute("d", "M 660 415 H 750 V 415 Q 750 420 740 420 H 670 Q 660 420 660 415 Z");
  }

  const flaskLiquid = document.getElementById("liquid");
  if (flaskLiquid) {
    flaskLiquid.setAttribute("d", "M 224 250 C 224 290 244 300 270 300 C 296 300 316 290 316 250 C 300 247 240 247 224 250 Z");
    flaskLiquid.style.opacity = "0.85";
  }

  equipmentButtons.forEach(b => {
    b.classList.remove("placed", "tool-cue");
    b.removeAttribute("aria-pressed");
  });

  const igniteBtn = document.getElementById("ignite");
  if (igniteBtn) igniteBtn.textContent = "🔥 Ignite burner";
  const coolingBtn = document.getElementById("cooling");
  if (coolingBtn) coolingBtn.textContent = "Start cooling water";
  const heatSlider = document.getElementById("heat");
  if (heatSlider) heatSlider.value = 0;
  const heatOut = document.getElementById("heatOut");
  if (heatOut) heatOut.textContent = "0%";

  ["obsT1", "obsN1", "obsT2", "obsN2", "obsV", "obsNotes"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });
  const obsFeedback = document.getElementById("obsFeedback");
  if (obsFeedback) obsFeedback.textContent = "";

  msg("Experiment reset. Drag equipment from tray or use controls to begin.");
  updateUI();
}

document.getElementById("reset").onclick = () => {
  resetExperimentState();
  if (state.mode === "demo") {
    state.demoStep = 0;
    updateDemoUI(`Ready (0/${demoSteps.length})`);
  }
};

document.getElementById("fixSetup").onclick = () => {
  ["stand", "clamp", "burner", "tripod", "gauze", "flask", "cork", "thermometer", "condenser", "beaker"].forEach(id => {
    state.placed.add(id);
    markToolPlaced(id);
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("is-placed");
      el.classList.add("snap");
      setTimeout(() => el.classList.remove("snap"), 350);
    }
  });
  state.flaskFilled = true;
  state.waterMeasured = true;
  state.acetoneMeasured = true;
  state.thermometerCorrect = true;
  state.condenserConnected = true;
  state.waterInletConnected = true;
  state.waterOutletConnected = true;
  const liquidPath = document.getElementById("liquid");
  if (liquidPath) {
    liquidPath.setAttribute("d", "M 224 235 C 224 290 244 300 270 300 C 296 300 316 290 316 235 C 300 232 240 232 224 235 Z");
  }
  msg("Apparatus automatically arranged exactly as shown in NCERT Fig 15.1. Start cooling and ignite burner.");
  updateUI();
};

function updateSimulation() {
  let target = 24;
  if (state.burnerActive && state.heatIntensity > 0 && state.flaskFilled) {
    // Acetone boils at ~56 °C; Water at 100 °C
    const ideal = state.acetoneFraction > 0.1 ? 56 : 100;
    target = 24 + (ideal - 24) * (state.heatIntensity / 100);
    if (!state.coolingActive) target += Math.min(18, state.heatIntensity * 0.16);

    const rate = Math.max(0, (state.temperature - 52)) / 850 * (state.heatIntensity / 100);
    if (state.heatIntensity >= 20 && state.coolingActive && state.thermometerCorrect && state.condenserConnected) {
      state.distillateVolume = Math.min(50, state.distillateVolume + rate * 1.8);
      state.acetoneFraction = Math.max(0, state.acetoneFraction - (rate * 1.8) / 50);

      if (state.distillateVolume > 2 && !state.firstComponentObserved) {
        state.firstComponentObserved = true;
        showToast("Component I (Acetone, BP ~56 °C) vaporizes, gets cooled in condenser and collects in beaker.");
      }
      if (state.acetoneFraction < 0.1 && !state.secondComponentObserved) {
        state.secondComponentObserved = true;
        showToast("Component I separation complete. Temperature rising toward Component II (Water, BP 100 °C).");
      }
    }
  }

  state.temperature += (target - state.temperature) * 0.035;
  document.getElementById("tempRead").textContent = Math.round(state.temperature) + " °C";
  document.getElementById("tempBig").textContent = Math.round(state.temperature) + " °C";
  document.getElementById("volume").textContent = Math.round(state.distillateVolume);

  // Update SVG Distillate level in receiving beaker
  const distillateLiquid = document.getElementById("distillateLiquid");
  if (distillateLiquid) {
    const fillH = Math.min(45, (state.distillateVolume / 50) * 45);
    const topY = 415 - fillH;
    distillateLiquid.setAttribute("d", `M 660 ${topY} H 750 V 415 Q 750 420 740 420 H 670 Q 660 420 660 415 Z`);
  }

  const flaskLiquid = document.getElementById("liquid");
  if (flaskLiquid) {
    flaskLiquid.style.opacity = String(0.55 + state.acetoneFraction * 0.35);
  }

  updateUI();
}

setInterval(updateSimulation, 100);

function updateUI() {
  const allApparatusPlaced = state.placed.has("tripod") && state.placed.has("gauze") &&
    state.placed.has("flask") && state.placed.has("cork") && state.thermometerCorrect &&
    state.placed.has("condenser") && state.placed.has("stand") && state.placed.has("clamp") &&
    state.placed.has("beaker");

  const done = [
    state.flaskFilled,
    allApparatusPlaced,
    state.coolingActive,
    state.burnerActive && state.heatIntensity > 0,
    state.firstComponentObserved,
    state.distillateVolume > 2,
    state.secondComponentObserved,
    state.observationsChecked,
    state.experimentCompleted
  ];

  done.forEach((x, i) => {
    const el = document.getElementById("step" + i);
    if (el) {
      el.classList.toggle("done", x);
      el.textContent = (x ? "✓ " : "○ ") + steps[i];
    }
  });

  const n = done.filter(Boolean).length;
  document.getElementById("progressBar").style.width = (n / done.length * 100) + "%";
  document.getElementById("progressPct").textContent = Math.round(n / done.length * 100) + "%";

  const statusChip = document.getElementById("statusChip");
  if (statusChip) {
    statusChip.className = "status-chip" + (state.experimentCompleted ? " done-exp" : state.burnerActive ? " active-heating" : "");
    statusChip.textContent = state.experimentCompleted ? "Experiment complete" :
      state.firstComponentObserved ? "Distillation in progress" :
      state.started ? "Heating mixture" :
      state.flaskFilled ? "Ready for heating" : "Setup incomplete";
  }
}

const helpText = document.getElementById("helpText");
document.getElementById("hint").onclick = () => {
  let t = !state.flaskFilled
    ? "Take a mixture of 50 mL water and 50 mL acetone in the round bottom flask."
    : !state.placed.has("condenser")
    ? "Arrange the water condenser connected to the side-arm of the flask."
    : !state.coolingActive
    ? "Turn on cold water inlet at the lower end of the condenser."
    : !state.burnerActive
    ? "Ignite the Bunsen burner and heat the mixture slowly and carefully."
    : "Observe temperature around 56 °C when acetone distils into the receiving beaker.";
  helpText.textContent = t;
  showToast(t);
};

document.getElementById("next").onclick = () => {
  document.querySelectorAll(".guided-highlight").forEach(x => x.classList.remove("guided-highlight"));
  let el;
  if (!state.flaskFilled) el = document.getElementById("flask");
  else if (!state.placed.has("condenser")) el = document.getElementById("condenser");
  else if (!state.coolingActive) el = document.getElementById("cooling");
  else if (!state.burnerActive) el = document.getElementById("burner");
  else el = document.getElementById("thermometer");

  if (el) {
    el.classList.add("guided-highlight");
    helpText.textContent = "Action highlighted: complete this step to proceed.";
  }
};

document.getElementById("why").onclick = () => {
  const t = state.temperature >= 52 && state.temperature < 75
    ? "Acetone has a lower boiling point (~56 °C) than water (100 °C), so it evaporates first and faster."
    : "Miscible liquids with a boiling point difference of >25 K are separated by simple distillation.";
  helpText.textContent = t;
  showToast(t);
};

document.getElementById("procedure").onclick = () => {
  const p = `<b>NCERT Experiment Procedure:</b><br>
  1. Take a mixture of 50 mL water and 50 mL acetone in a round bottom flask.<br>
  2. Arrange the apparatus as shown in Fig. 15.1 (retort stands, wire gauze, tripod, burner, cork, thermometer, Liebig condenser, and receiving beaker).<br>
  3. Heat the mixture of acetone and water slowly and carefully monitor the rise in temperature.<br>
  4. Observe and note the temperature at which the first component (acetone ~56 °C) distils out and collects in the receiving beaker.<br>
  5. Continue heating and observe the temperature at which the second component (water ~100 °C) distills.`;
  document.getElementById("procedureText").classList.toggle("hidden");
  document.getElementById("procedureText").innerHTML = p;
};

document.getElementById("checkObs").onclick = () => {
  const t1 = +document.getElementById("obsT1").value;
  const t2 = +document.getElementById("obsT2").value;
  const n1 = document.getElementById("obsN1").value.trim().toLowerCase();
  const n2 = document.getElementById("obsN2").value.trim().toLowerCase();
  const v = +document.getElementById("obsV").value;
  const f = document.getElementById("obsFeedback");

  let hints = [];
  if (!(t1 >= 50 && t1 <= 62) || (n1 !== "acetone" && n1 !== "propanone")) {
    hints.push("Component I distils at ~56 °C and is Acetone.");
  }
  if (!(t2 >= 95 && t2 <= 105) || (n2 !== "water" && n2 !== "h2o")) {
    hints.push("Component II distils at ~100 °C and is Water.");
  }
  if (v < 1 || v > 60) {
    hints.push("Record the volume of distillate collected in the beaker (e.g. 45–50 mL).");
  }

  if (hints.length) {
    f.textContent = "Hint: " + hints[0];
    state.observationsChecked = false;
  } else {
    f.textContent = "✓ Correct! Your observations match the NCERT experiment data.";
    state.observationsChecked = true;
    state.experimentCompleted = state.secondComponentObserved || state.firstComponentObserved;
    if (state.experimentCompleted) showConclusion();
  }
  updateUI();
};

function showConclusion() {
  openModal("Results and Discussion (NCERT)", `
    <p><b>Conclusion:</b></p>
    <ul>
      <li>The two components of the miscible liquids are separated by distillation based on the difference in their boiling points.</li>
      <li><b>Component I (Acetone):</b> Lower boiling point (~56 °C) — evaporates first, gets cooled in the condenser, and is collected in the receiving beaker.</li>
      <li><b>Component II (Water):</b> Higher boiling point (~100 °C) — remains in the round bottom flask after acetone is separated.</li>
    </ul>
  `);
}

function openModal(title, body) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
  document.getElementById("modal").classList.remove("hidden");
}

document.getElementById("modalX").onclick = () => document.getElementById("modal").classList.add("hidden");
document.getElementById("modal").onclick = e => {
  if (e.target.id === "modal") e.currentTarget.classList.add("hidden");
};

function runNextDemoStep() {
  if (state.demoStep >= demoSteps.length) {
    stopDemo();
    updateDemoUI(`Completed (${demoSteps.length}/${demoSteps.length})`);
    showToast("Demonstration completed! Press Stop to reset or Play Auto to replay.");
    return false;
  }

  if (state.demoStep === 0 && (state.placed.size > 0 || state.burnerActive)) {
    resetExperimentState();
  }

  const step = demoSteps[state.demoStep];
  step.run();
  state.demoStep++;

  const stepNum = state.demoStep;
  const total = demoSteps.length;
  updateDemoUI(`Step ${stepNum}/${total}: ${step.label}`);

  if (state.demoStep >= demoSteps.length) {
    stopDemo();
    showToast("Demonstration sequence completed!");
  }
  return true;
}

function startDemoAuto() {
  if (state.demoStep >= demoSteps.length) {
    state.demoStep = 0;
    resetExperimentState();
  }
  state.demoRunning = true;
  updateDemoControlsButtons();
  showToast("Auto demo playing...");

  const hasMore = runNextDemoStep();
  if (hasMore && state.demoRunning) {
    scheduleNextAutoStep();
  }
}

function scheduleNextAutoStep() {
  clearTimeout(state.demoTimer);
  if (!state.demoRunning) return;

  state.demoTimer = setTimeout(() => {
    if (state.demoRunning) {
      const hasMore = runNextDemoStep();
      if (hasMore && state.demoRunning) {
        scheduleNextAutoStep();
      }
    }
  }, 1800);
}

function stopDemo() {
  state.demoRunning = false;
  clearTimeout(state.demoTimer);
  state.demoTimer = null;
  updateDemoControlsButtons();
}

function resetDemo() {
  stopDemo();
  state.demoStep = 0;
  resetExperimentState();
  updateDemoUI(`Ready (0/${demoSteps.length})`);
  msg("Demo reset. Click 'Play Auto' or 'Next Step' to start.");
  showToast("Demo reset to initial step.");
}

function updateDemoUI(label) {
  const labelEl = document.getElementById("demoStepLabel");
  if (labelEl) labelEl.textContent = label;
  updateDemoControlsButtons();
}

function updateDemoControlsButtons() {
  const playBtn = document.getElementById("demoPlay");
  if (playBtn) {
    if (state.demoRunning) {
      playBtn.textContent = "⏸ Pause";
      playBtn.classList.remove("primary");
      playBtn.classList.add("active");
    } else {
      playBtn.textContent = "▶ Play Auto";
      playBtn.classList.add("primary");
      playBtn.classList.remove("active");
    }
  }
}

document.getElementById("demoPlay").onclick = () => {
  if (state.demoRunning) {
    stopDemo();
    showToast("Demo paused.");
  } else {
    startDemoAuto();
  }
};

document.getElementById("demoStop").onclick = () => {
  resetDemo();
};

document.getElementById("demoNext").onclick = () => {
  stopDemo();
  runNextDemoStep();
};

document.querySelectorAll(".mode").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".mode").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    state.mode = b.dataset.mode;

    const demoControls = document.getElementById("demoControls");
    if (state.mode === "demo") {
      demoControls.classList.remove("hidden");
      showToast("Demonstration mode active — use Play Auto, Stop, or Next Step.");
      const currentLabel = state.demoStep === 0
        ? `Ready (0/${demoSteps.length})`
        : state.demoStep >= demoSteps.length
        ? `Completed (${demoSteps.length}/${demoSteps.length})`
        : `Step ${state.demoStep}/${demoSteps.length}: ${demoSteps[state.demoStep - 1].label}`;
      updateDemoUI(currentLabel);
    } else {
      demoControls.classList.add("hidden");
      stopDemo();
      if (state.mode === "guided") showToast("Guided mode active — hints enabled.");
      else showToast("Free Lab mode active.");
    }
  };
});

updateUI();
