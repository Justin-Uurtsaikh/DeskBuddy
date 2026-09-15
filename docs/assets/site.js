(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll("[data-current-year]").forEach((item) => {
    item.textContent = String(new Date().getFullYear());
  });

  const stage = document.querySelector("#demo-stage");
  const pet = document.querySelector("#demo-pet");
  const motionToggle = document.querySelector("#motion-toggle");
  let wanderTimer;
  let stopTimer;
  let currentPosition = 0;
  let motionPaused = reducedMotion.matches;

  const wanderPositions = [
    { x: 65, y: 68 },
    { x: 78, y: 48 },
    { x: 48, y: 72 },
    { x: 28, y: 68 },
    { x: 54, y: 51 },
    { x: 73, y: 75 }
  ];

  function setToggleState() {
    if (!motionToggle) return;
    pet.classList.toggle("is-paused", motionPaused);
    motionToggle.setAttribute("aria-pressed", String(motionPaused));
    motionToggle.innerHTML = motionPaused
      ? '<span aria-hidden="true">▶</span> Play animation'
      : '<span aria-hidden="true">Ⅱ</span> Pause animation';
  }

  function movePet(x, y) {
    if (!pet) return;
    const oldX = Number(pet.dataset.x || 65);
    pet.classList.toggle("is-facing-left", x < oldX);
    pet.dataset.x = String(x);
    pet.style.left = String(x) + "%";
    pet.style.top = String(y) + "%";
    window.clearTimeout(stopTimer);
    pet.classList.remove("is-walking");
    if (!motionPaused) {
      pet.classList.add("is-walking");
      stopTimer = window.setTimeout(() => pet.classList.remove("is-walking"), 1380);
    }
  }

  function wander() {
    currentPosition = (currentPosition + 1) % wanderPositions.length;
    const target = wanderPositions[currentPosition];
    movePet(target.x, target.y);
  }

  function stopWandering() {
    window.clearInterval(wanderTimer);
    wanderTimer = undefined;
  }

  function startWandering() {
    stopWandering();
    if (motionPaused || reducedMotion.matches) return;
    wanderTimer = window.setInterval(wander, 3600);
  }

  if (stage && pet && motionToggle) {
    pet.dataset.x = "65";
    setToggleState();
    startWandering();

    stage.addEventListener("pointerdown", (event) => {
      const bounds = stage.getBoundingClientRect();
      const x = Math.max(12, Math.min(88, ((event.clientX - bounds.left) / bounds.width) * 100));
      const y = Math.max(19, Math.min(82, ((event.clientY - bounds.top) / bounds.height) * 100));
      movePet(x, y);
    });

    stage.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      wander();
    });

    motionToggle.addEventListener("click", () => {
      motionPaused = !motionPaused;
      setToggleState();
      if (motionPaused) {
        stopWandering();
        pet.classList.remove("is-walking");
      } else {
        wander();
        startWandering();
      }
    });

    reducedMotion.addEventListener("change", (event) => {
      motionPaused = event.matches;
      setToggleState();
      if (motionPaused) stopWandering();
      else startWandering();
    });
  }

  const copyButtons = document.querySelectorAll("[data-copy-command]");
  const toast = document.querySelector("#copy-toast");
  const commandText = "npm install\nnpm run dev";
  let toastTimer;
  const resetTimers = new WeakMap();

  function showCopyStatus(button, copied) {
    const originalLabel = button.dataset.copyLabel || button.textContent;
    button.dataset.copyLabel = originalLabel;
    button.textContent = copied ? "Copied!" : "Copy failed";
    window.clearTimeout(resetTimers.get(button));
    if (toast) {
      toast.textContent = copied ? "Commands copied" : "Could not copy the commands";
      toast.classList.add("is-visible");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
        toast.textContent = "";
      }, 1800);
    }
    resetTimers.set(button, window.setTimeout(() => {
      button.textContent = originalLabel;
      resetTimers.delete(button);
    }, 1800));
  }

  function fallbackCopy(text) {
    const field = document.createElement("textarea");
    try {
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(commandText);
          copied = true;
        } else {
          copied = fallbackCopy(commandText);
        }
      } catch {
        copied = fallbackCopy(commandText);
      }
      showCopyStatus(button, copied);
    });
  });
})();
