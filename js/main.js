const year = document.querySelector('[data-current-year]');

if (year) {
  year.textContent = new Date().getFullYear();
}

const workflowStack = document.querySelector('.workflow-stack');
const projectItems = document.querySelector('[data-project-items]');
const projectDropZone = document.querySelector('[data-project-drop-zone]');
const projectStatus = document.querySelector('[data-project-status]');

if (workflowStack && projectItems && projectDropZone && projectStatus) {
  const cards = Array.from(workflowStack.querySelectorAll('.workflow-card')).reverse();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeCard = workflowStack.querySelector('.workflow-card:not(.workflow-card-back)');
  let isChoosing = false;
  let drag = null;

  cards.forEach((card) => {
    card.addEventListener('animationend', (event) => {
      if (event.target === card) {
        card.style.animation = 'none';
      }
    }, { once: true });
  });

  function updateActionAvailability() {
    cards.forEach((card) => {
      card.inert = card !== activeCard;
      card.querySelectorAll('[data-choice]').forEach((button) => {
        button.disabled = isChoosing || card !== activeCard;
      });
    });
  }

  function promoteNextCard() {
    const nextCard = cards.find((card) => card.isConnected);

    if (!nextCard) {
      activeCard = null;
      return;
    }

    const startingTransform = window.getComputedStyle(nextCard).transform;
    nextCard.style.animation = 'none';
    nextCard.style.transform = startingTransform;
    nextCard.classList.remove('workflow-card-back', 'workflow-card-back-left', 'workflow-card-back-right');
    nextCard.classList.add('is-active');
    activeCard = nextCard;

    if (reducedMotion.matches) {
      nextCard.style.removeProperty('transform');
      return;
    }

    nextCard.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      nextCard.style.transform = 'none';
      window.setTimeout(() => nextCard.style.removeProperty('transform'), 500);
    });
  }

  function addProjectItem(item) {
    const emptyRow = projectItems.querySelector('[data-project-empty]');
    emptyRow?.remove();

    const row = document.createElement('tr');
    row.className = 'project-row-enter';

    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = item.projectTitle ?? '';

    const time = document.createElement('td');
    time.textContent = item.projectTime ?? '';

    const cost = document.createElement('td');
    cost.textContent = item.projectCost ?? '';

    row.append(name, time, cost);
    projectItems.append(row);
  }

  function createCardEffect(card, sourceRect, effectClass) {
    const flightCard = card.cloneNode(true);
    const computedStyle = window.getComputedStyle(card);
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    let translateX = 0;
    let translateY = 0;

    if (computedStyle.transform !== 'none') {
      if (window.DOMMatrixReadOnly) {
        const matrix = new DOMMatrixReadOnly(computedStyle.transform);
        translateX = matrix.m41;
        translateY = matrix.m42;
      } else {
        const matrixValues = computedStyle.transform.match(/matrix(3d)?\(([^)]+)\)/);

        if (matrixValues) {
          const values = matrixValues[2].split(',').map(Number);
          const translationIndex = matrixValues[1] ? 12 : 4;
          translateX = values[translationIndex] ?? 0;
          translateY = values[translationIndex + 1] ?? 0;
        }
      }
    }
    flightCard.className = `workflow-card workflow-flight ${effectClass}`;
    flightCard.setAttribute('aria-hidden', 'true');
    flightCard.querySelectorAll('button').forEach((button) => button.remove());
    flightCard.style.animation = 'none';
    flightCard.style.transition = 'none';
    flightCard.style.left = `${sourceRect.left + (sourceRect.width - cardWidth) / 2 - translateX}px`;
    flightCard.style.top = `${sourceRect.top + (sourceRect.height - cardHeight) / 2 - translateY}px`;
    flightCard.style.width = `${cardWidth}px`;
    flightCard.style.height = `${cardHeight}px`;
    flightCard.style.transformOrigin = computedStyle.transformOrigin;
    flightCard.style.transform = computedStyle.transform === 'none' ? 'none' : computedStyle.transform;
    document.body.append(flightCard);
    return flightCard;
  }

  function animateCardToProject(card, sourceRect, onComplete, visualCard = card) {
    const flightCard = visualCard === card
      ? createCardEffect(card, sourceRect, '')
      : visualCard;

    card.remove();
    promoteNextCard();

    if (reducedMotion.matches) {
      flightCard.remove();
      onComplete();
      return;
    }

    const targetRect = projectDropZone.getBoundingClientRect();
    const startScroll = window.scrollY;
    const targetDocumentY = targetRect.top + startScroll + targetRect.height / 2;
    const targetScreenY = Math.min(window.innerHeight * 0.76, targetDocumentY);
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const endScroll = Math.min(maxScroll, Math.max(0, targetDocumentY - targetScreenY));
    const endScreenY = targetDocumentY - endScroll;
    const cardWidth = flightCard.offsetWidth;
    const cardHeight = flightCard.offsetHeight;
    const startLeft = Number.parseFloat(flightCard.style.left);
    const startTop = Number.parseFloat(flightCard.style.top);
    const endScreenTop = endScreenY - cardHeight / 2;
    const endScreenX = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    const originalTransform = flightCard.style.transform === 'none' ? '' : `${flightCard.style.transform} `;
    const startTime = performance.now();
    const duration = 1400;

    document.documentElement.classList.add('is-project-flying');

    function frame(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const fall = progress * progress;
      const left = startLeft + (endScreenX - startLeft) * fall;
      const top = startTop + (endScreenTop - startTop) * fall;
      const rotateZ = 4 + 16 * fall;
      const rotateX = 10 * fall;
      const rotateY = -7 * fall;

      flightCard.style.left = `${left}px`;
      flightCard.style.top = `${top}px`;
      flightCard.style.transform = `${originalTransform}perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${1 - fall * 0.62})`;
      flightCard.style.opacity = String(1 - Math.max(0, (progress - 0.82) / 0.18));
      window.scrollTo(window.scrollX, startScroll + (endScroll - startScroll) * fall);

      if (progress < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      window.scrollTo(window.scrollX, endScroll);
      document.documentElement.classList.remove('is-project-flying');
      flightCard.remove();
      onComplete();
    }

    window.requestAnimationFrame(frame);
  }

  function burnCard(card, sourceRect, onComplete, visualCard = card) {
    const burningCard = visualCard === card
      ? createCardEffect(card, sourceRect, 'workflow-burn')
      : visualCard;
    burningCard.className = 'workflow-card workflow-flight workflow-burn';
    burningCard.setAttribute('aria-hidden', 'true');
    burningCard.style.animation = 'none';
    burningCard.style.transition = 'none';
    burningCard.style.borderColor = 'transparent';
    burningCard.style.boxShadow = 'none';
    const cardStyle = window.getComputedStyle(burningCard);
    const cardWidth = burningCard.offsetWidth;
    const cardHeight = burningCard.offsetHeight;
    const startLeft = Number.parseFloat(burningCard.style.left);
    const startTop = Number.parseFloat(burningCard.style.top);
    const bleed = 32;
    const sceneWidth = cardWidth + bleed * 2;
    const sceneHeight = cardHeight + bleed * 2;
    let startRotation = 0;

    if (cardStyle.transform !== 'none') {
      if (window.DOMMatrixReadOnly) {
        const matrix = new DOMMatrixReadOnly(cardStyle.transform);
        startRotation = Math.atan2(matrix.m12, matrix.m11) * 180 / Math.PI;
      } else {
        const matrixValues = cardStyle.transform.match(/matrix(3d)?\(([^)]+)\)/);

        if (matrixValues) {
          const values = matrixValues[2].split(',').map(Number);
          startRotation = Math.atan2(values[1], values[0]) * 180 / Math.PI;
        }
      }
    }
    const burnTransform = `rotateZ(${startRotation}deg)`;
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const scene = document.createElementNS(svgNamespace, 'svg');
    scene.classList.add('workflow-burn-scene');
    scene.setAttribute('aria-hidden', 'true');
    scene.setAttribute('width', String(sceneWidth));
    scene.setAttribute('height', String(sceneHeight));
    scene.setAttribute('viewBox', `0 0 ${sceneWidth} ${sceneHeight}`);
    scene.style.left = `${startLeft - bleed}px`;
    scene.style.top = `${startTop - bleed}px`;
    scene.style.width = `${sceneWidth}px`;
    scene.style.height = `${sceneHeight}px`;
    scene.style.transform = `translate3d(0, 0, 0) ${burnTransform}`;
    const defs = document.createElementNS(svgNamespace, 'defs');
    const clipId = `workflow-burn-${Math.random().toString(36).slice(2)}`;
    const clipPath = document.createElementNS(svgNamespace, 'clipPath');
    clipPath.id = clipId;
    clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const clipShape = document.createElementNS(svgNamespace, 'path');
    clipShape.setAttribute('transform', `translate(${bleed} ${bleed})`);
    clipPath.append(clipShape);
    defs.append(clipPath);
    scene.append(defs);
    const cardSurface = document.createElementNS(svgNamespace, 'foreignObject');
    cardSurface.setAttribute('x', String(bleed));
    cardSurface.setAttribute('y', String(bleed));
    cardSurface.setAttribute('width', String(cardWidth));
    cardSurface.setAttribute('height', String(cardHeight));
    cardSurface.setAttribute('clip-path', `url(#${clipId})`);
    const cardWrapper = document.createElement('div');
    cardWrapper.style.width = `${cardWidth}px`;
    cardWrapper.style.height = `${cardHeight}px`;
    cardWrapper.style.overflow = 'hidden';
    burningCard.className = 'workflow-card workflow-burn';
    burningCard.style.position = 'relative';
    burningCard.style.inset = 'auto';
    burningCard.style.width = `${cardWidth}px`;
    burningCard.style.height = `${cardHeight}px`;
    burningCard.style.margin = '0';
    burningCard.style.transform = 'none';
    burningCard.style.transformOrigin = 'center';
    burningCard.style.opacity = '1';
    cardWrapper.append(burningCard);
    cardSurface.append(cardWrapper);
    scene.append(cardSurface);
    const fire = document.createElement('canvas');
    const fireSurface = document.createElementNS(svgNamespace, 'foreignObject');
    fireSurface.setAttribute('x', '0');
    fireSurface.setAttribute('y', '0');
    fireSurface.setAttribute('width', String(sceneWidth));
    fireSurface.setAttribute('height', String(sceneHeight));
    const fireWrapper = document.createElement('div');
    fireWrapper.style.width = `${sceneWidth}px`;
    fireWrapper.style.height = `${sceneHeight}px`;
    fireWrapper.style.overflow = 'visible';
    const dpr = Math.min(window.devicePixelRatio, 1.25);
    fire.width = Math.ceil(sceneWidth * dpr);
    fire.height = Math.ceil(sceneHeight * dpr);
    fire.style.display = 'block';
    fire.style.width = `${sceneWidth}px`;
    fire.style.height = `${sceneHeight}px`;
    fireWrapper.append(fire);
    fireSurface.append(fireWrapper);
    scene.append(fireSurface);
    const context = fire.getContext('2d');

    if (!context) {
      console.error('Unable to create a 2D canvas context for the card burn effect.');
      scene.remove();
      card.remove();
      promoteNextCard();
      onComplete();
      return;
    }

    document.body.append(scene);
    card.remove();
    promoteNextCard();

    if (reducedMotion.matches) {
      scene.remove();
      onComplete();
      return;
    }

    const startTime = performance.now();
    const duration = 580;
    const width = cardWidth;
    const height = cardHeight;
    const sampleCount = Math.max(32, Math.ceil(width / 10));
    const edgePositions = Array.from({ length: sampleCount + 1 }, (_, index) => index / sampleCount * 100);
    const noiseSeed = Array.from({ length: 17 }, () => Math.random());
    const radius = 12;
    const radiusX = Math.min((radius / width) * 100, 50);
    const radiusY = Math.min((radius / height) * 100, 50);

    function traceSmoothedEdge(points) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length - 1; index += 1) {
        const midpointX = (points[index].x + points[index + 1].x) / 2;
        const midpointY = (points[index].y + points[index + 1].y) / 2;
        context.quadraticCurveTo(points[index].x, points[index].y, midpointX, midpointY);
      }
      const lastPoint = points[points.length - 1];
      context.lineTo(lastPoint.x, lastPoint.y);
    }

    function edgeAt(index, now, progress) {
      const position = index / sampleCount * (noiseSeed.length - 1);
      const segment = Math.min(noiseSeed.length - 2, Math.floor(position));
      const mix = position - segment;
      const easedMix = mix * mix * (3 - 2 * mix);
      const randomHeight = noiseSeed[segment] + (noiseSeed[segment + 1] - noiseSeed[segment]) * easedMix;
      const slowWave = Math.sin(now / 210 + index / 15) * 1.2;
      const contour = ((randomHeight - 0.5) * 9 + slowWave) * Math.min(1, progress * 4);
      const positionX = index / sampleCount;
      const cornerDepth = positionX < radiusX / 100
        ? radiusY * (1 - Math.sqrt(Math.max(0, 1 - ((radiusX / 100 - positionX) / (radiusX / 100)) ** 2)))
        : positionX > 1 - radiusX / 100
          ? radiusY * (1 - Math.sqrt(Math.max(0, 1 - ((positionX - (1 - radiusX / 100)) / (radiusX / 100)) ** 2)))
          : radiusY;

      return 100 - cornerDepth - progress * 114 + contour;
    }

    function createBurnPath(edge) {
      const edgePoints = edge.map((value, index) => ({
        x: width * edgePositions[index] / 100,
        y: Math.max(radius, Math.min(height, height * value / 100)),
      }));
      let path = `M ${radius} 0 L ${width - radius} 0 Q ${width} 0 ${width} ${radius} L ${width} ${edgePoints[sampleCount].y}`;

      for (let index = sampleCount - 1; index > 0; index -= 1) {
        const point = edgePoints[index];
        const nextPoint = edgePoints[index - 1];
        path += ` Q ${point.x} ${point.y} ${(point.x + nextPoint.x) / 2} ${(point.y + nextPoint.y) / 2}`;
      }

      path += ` Q ${edgePoints[0].x} ${edgePoints[0].y} 0 ${edgePoints[0].y} L 0 ${radius} Q 0 0 ${radius} 0 Z`;
      return path;
    }

    function burnFrame(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const edge = edgePositions.map((_, index) => edgeAt(index, now, progress));
      clipShape.setAttribute('d', createBurnPath(edge));
      burningCard.style.opacity = String(1 - Math.max(0, (progress - 0.92) / 0.08));
      scene.style.transform = `translate3d(${-progress * 10}px, ${-progress * 10}px, 0) ${burnTransform}`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, sceneWidth, sceneHeight);
      context.globalCompositeOperation = 'lighter';
      context.save();
      context.translate(bleed, bleed);

      const edgeY = edge.map((value) => Math.max(radius, Math.min(height, height * value / 100)));
      const edgePoints = edgeY.map((y, index) => ({
        x: width * edgePositions[index] / 100,
        y,
      }));
      traceSmoothedEdge(edgePoints);
      const emberLine = context.createLinearGradient(0, 0, width, 0);
      emberLine.addColorStop(0, 'rgba(255, 89, 22, 0.15)');
      emberLine.addColorStop(0.3, 'rgba(255, 198, 67, 0.9)');
      emberLine.addColorStop(0.65, 'rgba(255, 104, 20, 0.8)');
      emberLine.addColorStop(1, 'rgba(255, 231, 139, 0.35)');
      context.strokeStyle = emberLine;
      context.lineWidth = 13 + Math.sin(now / 150) * 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.shadowColor = '#ff5715';
      context.shadowBlur = 22;
      context.stroke();
      traceSmoothedEdge(edgePoints);
      context.strokeStyle = 'rgba(255, 232, 159, 0.95)';
      context.lineWidth = 1.5 + Math.sin(now / 37) * 0.5;
      context.shadowColor = '#ffcf57';
      context.shadowBlur = 9;
      context.stroke();
      context.shadowBlur = 0;

      const flameStep = Math.max(1, Math.floor(edgeY.length / 10));
      for (let index = 0; index < edgeY.length; index += flameStep) {
        const x = width * edgePositions[index] / 100;
        const baseline = edgeY[index];
        const seed = noiseSeed[Math.floor(index / edgeY.length * noiseSeed.length)];
        const flicker = Math.sin(now / (115 + seed * 90) + index * 1.37);
        const flameHeight = 14 + seed * 22 + flicker * 7;
        const flameWidth = 8 + seed * 8;
        const tipX = x + Math.sin(now / 120 + index) * flameWidth * 0.45;
        const flameTop = baseline - flameHeight;
        const flameGradient = context.createLinearGradient(0, flameTop, 0, baseline);
        flameGradient.addColorStop(0, 'rgba(255, 242, 177, 0.04)');
        flameGradient.addColorStop(0.3, 'rgba(255, 205, 91, 0.68)');
        flameGradient.addColorStop(1, 'rgba(255, 81, 18, 0.08)');
        context.beginPath();
        context.moveTo(x - flameWidth, baseline + 4);
        context.bezierCurveTo(
          x - flameWidth * 0.55,
          baseline - flameHeight * 0.3,
          tipX - flameWidth * 0.3,
          flameTop + flameHeight * 0.18,
          tipX,
          flameTop,
        );
        context.bezierCurveTo(
          tipX + flameWidth * 0.5,
          flameTop + flameHeight * 0.42,
          x + flameWidth * 0.7,
          baseline - flameHeight * 0.2,
          x + flameWidth,
          baseline + 4,
        );
        context.quadraticCurveTo(x, baseline + 9, x - flameWidth, baseline + 4);
        context.closePath();
        context.fillStyle = flameGradient;
        context.shadowColor = '#ff641b';
        context.shadowBlur = 12;
        context.fill();
      }

      for (let index = 0; index < 10; index += 1) {
        const seed = noiseSeed[(index * 7) % noiseSeed.length];
        const age = (now / (760 + seed * 530) + seed * 3.7) % 1;
        const xIndex = Math.min(edgeY.length - 1, Math.floor(seed * edgeY.length));
        const x = width * edgePositions[xIndex] / 100 + Math.sin(age * 8 + index) * (4 + seed * 6);
        const y = edgeY[xIndex] - age * (20 + seed * 43);
        const sparkLength = 2 + seed * 4;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + Math.sin(index + now / 190) * sparkLength, y - sparkLength * 1.8);
        context.strokeStyle = seed > 0.55 ? 'rgba(255, 238, 164, 0.95)' : 'rgba(255, 105, 24, 0.88)';
        context.lineWidth = 1 + seed * 1.3;
        context.shadowColor = '#ff7a18';
        context.shadowBlur = 7 + seed * 8;
        context.stroke();
      }
      context.shadowBlur = 0;
      context.restore();

      if (progress < 1) {
        window.requestAnimationFrame(burnFrame);
      } else {
        scene.remove();
        onComplete();
      }
    }

    burnFrame(startTime);
  }

  function chooseCard(card, approved, visualCard = card) {
    if (card !== activeCard || isChoosing) {
      return;
    }

    isChoosing = true;
    updateActionAvailability();
    const sourceRect = visualCard.getBoundingClientRect();
    const title = card.dataset.projectTitle ?? 'Карточка';
    const cardData = {
      projectTitle: card.dataset.projectTitle,
      projectTime: card.dataset.projectTime,
      projectCost: card.dataset.projectCost,
    };

    const onComplete = () => {
      if (approved) {
        addProjectItem(cardData);
        projectStatus.textContent = `Добавлено в «Ваш проект»: ${title}.`;
      } else {
        projectStatus.textContent = `Карточка сожжена: ${title}.`;
      }

      isChoosing = false;
      updateActionAvailability();
    };

    if (approved) {
      animateCardToProject(card, sourceRect, onComplete, visualCard);
    } else {
      burnCard(card, sourceRect, onComplete, visualCard);
    }
  }

  function resetCardTilt(card) {
    card.classList.remove('is-tilting');
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
    card.style.removeProperty('--tilt-z');
  }

  workflowStack.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-choice]');
    const card = button?.closest('.workflow-card');

    if (!button || !card || card !== activeCard) {
      return;
    }

    chooseCard(card, button.dataset.choice === 'approve');
  });

  workflowStack.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.workflow-card.is-active');

    if (!card || event.button !== 0 || event.target.closest('button') || isChoosing) {
      return;
    }

    drag = {
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocityX: 0,
      rect: card.getBoundingClientRect(),
      previousVisibility: card.style.visibility,
      previousAnimation: card.style.animation,
    };
    card.classList.remove('is-tilting');
    card.style.animation = 'none';
    const ghost = card.cloneNode(true);
    ghost.className = 'workflow-card workflow-drag-ghost is-dragging';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    ghost.style.left = `${drag.rect.left}px`;
    ghost.style.top = `${drag.rect.top}px`;
    ghost.style.width = `${drag.rect.width}px`;
    ghost.style.height = `${drag.rect.height}px`;
    ghost.style.transform = 'none';
    ghost.style.animation = 'none';
    document.body.append(ghost);
    drag.ghost = ghost;
    card.style.visibility = 'hidden';
    card.classList.add('is-dragging');
    card.setPointerCapture(event.pointerId);
  });

  workflowStack.addEventListener('pointermove', (event) => {
    if (drag && event.pointerId === drag.pointerId) {
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      const now = performance.now();
      const elapsed = Math.max(1, now - drag.lastTime);
      drag.velocityX = (event.clientX - drag.lastX) / elapsed;
      drag.lastX = event.clientX;
      drag.lastTime = now;

      const width = drag.rect.width;
      const tilt = Math.max(-14, Math.min(14, (deltaX / width) * 18));
      drag.ghost.style.left = `${drag.rect.left + deltaX}px`;
      drag.ghost.style.top = `${drag.rect.top + deltaY * 0.28}px`;
      drag.ghost.style.transform = `perspective(1200px) rotateX(${-deltaY * 0.025}deg) rotateY(${tilt * 0.35}deg) rotateZ(${tilt}deg)`;
      drag.ghost.style.setProperty('--approve-opacity', String(Math.max(0, deltaX / (width * 0.35))));
      drag.ghost.style.setProperty('--reject-opacity', String(Math.max(0, -deltaX / (width * 0.35))));
      return;
    }

    const card = event.target.closest('.workflow-card.is-active');

    if (!card || event.pointerType === 'touch' || isChoosing) {
      return;
    }

    const rect = card.getBoundingClientRect();
    const horizontal = (event.clientX - rect.left) / rect.width * 2 - 1;
    const vertical = (event.clientY - rect.top) / rect.height * 2 - 1;
    card.style.setProperty('--tilt-x', `${-vertical * 3}deg`);
    card.style.setProperty('--tilt-y', `${horizontal * 6}deg`);
    card.style.setProperty('--tilt-z', `${horizontal * 3}deg`);
    card.classList.add('is-tilting');
  });

  function finishDrag(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const { card, ghost, startX, startY, velocityX, previousVisibility, previousAnimation } = drag;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const threshold = card.getBoundingClientRect().width * 0.24;
    drag = null;
    card.classList.remove('is-dragging');

    if (!cancelled && (Math.abs(deltaX) >= threshold || (Math.abs(deltaX) > 36 && Math.abs(velocityX) > 0.55))) {
      chooseCard(card, deltaX > 0, ghost);
      return;
    }

    ghost.remove();
    card.style.visibility = previousVisibility;
    card.style.animation = previousAnimation;
    card.style.transform = '';

    if (cancelled || Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      resetCardTilt(card);
      return;
    }
  }

  workflowStack.addEventListener('pointerup', (event) => finishDrag(event));
  workflowStack.addEventListener('pointercancel', (event) => finishDrag(event, true));

  workflowStack.addEventListener('pointerout', (event) => {
    const card = event.target.closest('.workflow-card.is-active');

    if (card && !card.contains(event.relatedTarget) && !drag) {
      resetCardTilt(card);
    }
  });

  updateActionAvailability();
}
