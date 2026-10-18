const siteLoader = document.querySelector('.site-loader');

if (siteLoader && document.documentElement.classList.contains('is-loading')) {
  const pageRoot = document.documentElement;
  const logEntries = siteLoader.querySelector('.site-loader-log-entries');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const waitForFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

  async function prepareSiteIntro() {
    const startedAt = performance.now();
    const cards = Array.from(document.querySelectorAll('.workflow-card'));
    let logCount = 0;

    function logLoaderStep(message, complete = false) {
      if (!logEntries) {
        return;
      }

      const entry = document.createElement('div');
      const timestamp = document.createElement('time');
      const description = document.createElement('span');
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(2);
      entry.className = `site-loader-log-entry${complete ? ' is-complete' : ''}`;
      timestamp.textContent = `${elapsed}s`;
      description.textContent = message;
      entry.append(timestamp, description);
      logEntries.append(entry);
      logCount += 1;

      if (logCount > 4) {
        logEntries.firstElementChild?.remove();
      }
    }

    logLoaderStep('Запуск страницы');
    logLoaderStep('Проверка шрифтов');
    await document.fonts.ready;
    logLoaderStep('Шрифты готовы', true);

    if (!reducedMotion.matches) {
      logLoaderStep('Подготовка анимаций');
      pageRoot.classList.add('is-preparing-animations');
      cards.forEach((card) => window.getComputedStyle(card).transform);
      await waitForFrame();
      await waitForFrame();
      logLoaderStep('Карточки готовы', true);
    } else {
      logLoaderStep('Анимации отключены', true);
    }

    await wait(Math.max(0, 1200 - (performance.now() - startedAt)));
    logLoaderStep('Подключение завершено', true);
    siteLoader.classList.add('is-connected');
    siteLoader.setAttribute('aria-label', 'Подключено');
    await wait(280);
    siteLoader.classList.add('is-exiting');
    await wait(220);
    siteLoader.remove();
    pageRoot.classList.remove('is-loading');

    window.setTimeout(() => {
      pageRoot.classList.remove('is-loader-intro', 'is-preparing-animations');
    }, reducedMotion.matches ? 0 : 1700);
  }

  prepareSiteIntro();
}

const year = document.querySelector('[data-current-year]');

if (year) {
  year.textContent = new Date().getFullYear();
}

const pageRefreshNotice = document.querySelector('.page-refresh-notice');
const navigationEntry = window.performance.getEntriesByType('navigation')[0];

if (
  pageRefreshNotice
  && navigationEntry?.type === 'reload'
  && !document.documentElement.classList.contains('is-loading')
) {
  pageRefreshNotice.hidden = false;
  window.requestAnimationFrame(() => pageRefreshNotice.classList.add('is-visible'));
  window.setTimeout(() => {
    pageRefreshNotice.classList.remove('is-visible');
    pageRefreshNotice.classList.add('is-hiding');
    window.setTimeout(() => pageRefreshNotice.remove(), 200);
  }, 2400);
}

const workflowStack = document.querySelector('.workflow-stack');
const projectItems = document.querySelector('[data-project-items]');
const projectDropZone = document.querySelector('[data-project-drop-zone]');
const projectStatus = document.querySelector('[data-project-status]');

if (workflowStack && projectItems && projectDropZone && projectStatus) {
  const cards = Array.from(workflowStack.querySelectorAll('.workflow-card')).reverse();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const workflowComplete = workflowStack.querySelector('[data-workflow-complete]');
  const workflowCompleteTitle = workflowComplete?.querySelector('[data-workflow-complete-title]');
  const workflowCompleteDescription = workflowComplete?.querySelector('[data-workflow-complete-description]');
  const workflowCompleteAnalyst = workflowComplete?.querySelector('[data-workflow-complete-analyst]');
  let activeCard = workflowStack.querySelector('.workflow-card:not(.workflow-card-back)');
  let approvedCardCount = 0;
  let isChoosing = false;
  let drag = null;
  let swipeHintTimeout;
  let swipeHintCleanup;
  let swipeHintFrame;
  let swipeHintFadeTimeout;
  let swipeHintFadeCleanupTimeout;
  let swipeHintObserver;

  function getEffectiveZoom(element) {
    let zoom = 1;

    for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const ancestorZoom = Number.parseFloat(window.getComputedStyle(ancestor).zoom);

      if (Number.isFinite(ancestorZoom)) {
        zoom *= ancestorZoom;
      }
    }

    return zoom;
  }

  function updateDragVisual(ghost, rect, deltaX, deltaY, zoom = 1) {
    const tilt = Math.max(-14, Math.min(14, (deltaX / rect.width) * 18));
    ghost.style.left = `${(rect.left + deltaX) / zoom}px`;
    ghost.style.top = `${(rect.top + deltaY * 0.28) / zoom}px`;
    ghost.style.transform = `perspective(1200px) rotateX(${-deltaY * 0.025}deg) rotateY(${tilt * 0.35}deg) rotateZ(${tilt}deg)`;
    ghost.style.setProperty('--approve-opacity', String(Math.max(0, deltaX / (rect.width * 0.35))));
    ghost.style.setProperty('--reject-opacity', String(Math.max(0, -deltaX / (rect.width * 0.35))));
  }

  function startSwipeHint(card) {
    if (!card || card !== activeCard || reducedMotion.matches) {
      return;
    }

    swipeHintTimeout = window.setTimeout(() => {
      if (reducedMotion.matches || card !== activeCard || !card.isConnected || isChoosing || drag) {
        return;
      }

      const rect = card.getBoundingClientRect();
      const zoom = getEffectiveZoom(card);
      const layoutRect = {
        left: rect.left / zoom,
        top: rect.top / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom,
      };
      const departmentClass = Array.from(card.classList).find((className) => className.startsWith('workflow-card-department-'));
      const ghost = card.cloneNode(true);
      ghost.className = `workflow-card is-active ${departmentClass ?? ''} workflow-drag-ghost workflow-hint-ghost is-dragging is-swipe-hint`.trim();
      ghost.setAttribute('aria-hidden', 'true');
      const cursor = document.createElement('span');
      const cursorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const cursorPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      cursor.className = 'workflow-hint-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      cursorSvg.setAttribute('viewBox', '0 0 24 30');
      cursorSvg.setAttribute('focusable', 'false');
      cursorPath.setAttribute('d', 'M3 2.5v22l5.2-5 3.4 7.2 3.2-1.5-3.2-7h7.2L3 2.5z');
      cursorSvg.append(cursorPath);
      cursor.append(cursorSvg);
      ghost.append(cursor);
      ghost.style.zoom = String(zoom);
      ghost.style.left = `${layoutRect.left}px`;
      ghost.style.top = `${layoutRect.top}px`;
      ghost.style.width = `${layoutRect.width}px`;
      ghost.style.height = `${layoutRect.height}px`;
      ghost.style.transform = 'none';
      ghost.style.animation = 'none';
      document.body.append(ghost);
      const previousVisibility = card.style.visibility;
      card.style.visibility = 'hidden';

      swipeHintCleanup = () => {
        window.cancelAnimationFrame(swipeHintFrame);
        window.clearTimeout(swipeHintFadeTimeout);
        window.clearTimeout(swipeHintFadeCleanupTimeout);
        ghost.remove();
        card.style.visibility = previousVisibility;
        swipeHintCleanup = null;
      };

      const duration = 2400;
      const fadeDuration = 700;
      const startTime = performance.now();
      let fadeStartedAt;
      const animateSwipeHint = (now) => {
        const elapsed = now - startTime;
        const visualRect = card.getBoundingClientRect();
        const currentRect = {
          left: visualRect.left / zoom,
          top: visualRect.top / zoom,
          width: visualRect.width / zoom,
          height: visualRect.height / zoom,
        };
        const progress = Math.min(elapsed / duration, 1);
        const deltaX = -currentRect.width * 0.08 * Math.sin(progress * Math.PI * 2) * Math.sin(progress * Math.PI);

        ghost.style.top = `${currentRect.top}px`;
        ghost.style.width = `${currentRect.width}px`;
        ghost.style.height = `${currentRect.height}px`;
        updateDragVisual(ghost, currentRect, deltaX, 0);

        if (fadeStartedAt === undefined || now - fadeStartedAt < fadeDuration) {
          swipeHintFrame = window.requestAnimationFrame(animateSwipeHint);
        }

        if (elapsed >= duration && !swipeHintFadeTimeout) {
          swipeHintFadeTimeout = window.setTimeout(() => {
            ghost.classList.add('is-swipe-hint-fading');
            fadeStartedAt = performance.now();
            swipeHintFadeCleanupTimeout = window.setTimeout(swipeHintCleanup, fadeDuration);
          }, 400);
        }
      };
      swipeHintFrame = window.requestAnimationFrame(animateSwipeHint);
    }, 250);
  }

  cards.forEach((card) => {
    card.addEventListener('animationend', (event) => {
      if (event.target !== card) {
        return;
      }

      card.style.animation = 'none';
    }, { once: true });
  });

  document.fonts.ready.then(() => {
    swipeHintObserver = new IntersectionObserver((entries) => {
      const hasReachedCards = entries.some((entry) => entry.isIntersecting);

      if (!hasReachedCards) {
        return;
      }

      swipeHintObserver.disconnect();

      if (!reducedMotion.matches) {
        startSwipeHint(activeCard);
      }
    }, { threshold: 0.35 });
    swipeHintObserver.observe(workflowStack);
  });

  document.querySelectorAll('[data-replay-swipe-hint]').forEach((replaySwipeHintButton) => {
    replaySwipeHintButton.addEventListener('click', () => {
      document.querySelector('#hero-title')?.scrollIntoView({
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  });

  function updateCardAvailability() {
    cards.forEach((card) => {
      card.inert = card !== activeCard;
    });
  }

  function showWorkflowComplete(card = activeCard, finalized = false) {
    if (
      !workflowComplete
      || !workflowCompleteTitle
      || !workflowCompleteDescription
      || !workflowCompleteAnalyst
      || (finalized ? Boolean(activeCard) : !isLastCard(card))
    ) {
      return;
    }

    if (card?.isConnected) {
      workflowStack.style.setProperty('--workflow-stack-min-height', `${card.offsetHeight}px`);
      workflowStack.classList.add('has-workflow-complete');
    }

    workflowCompleteTitle.textContent = 'ЭТО НЕ ВСЁ';
    workflowCompleteDescription.textContent = 'Детализируйте проект — так мы сможем подобрать оптимальное решение и рассчитать стоимость.';

    if (approvedCardCount > 0 || !finalized) {
      workflowCompleteAnalyst.hidden = true;
      workflowCompleteAnalyst.classList.remove('is-visible');
      workflowComplete.classList.remove('is-all-rejected');
    } else {
      workflowCompleteAnalyst.textContent = 'Не подошло? Аналитик поможет найти решение и ответит на вопросы. Продолжайте детализировать ваш проект.';
      workflowCompleteAnalyst.hidden = false;
      workflowCompleteAnalyst.classList.add('is-visible');
      workflowComplete.classList.add('is-all-rejected');
    }

    workflowComplete.hidden = false;
  }

  function isLastCard(card) {
    return card === activeCard && cards.filter((workflowCard) => workflowCard.isConnected).length === 1;
  }

  if (workflowComplete) {
    workflowComplete.addEventListener('pointermove', (event) => {
      if (reducedMotion.matches || event.pointerType === 'touch') {
        return;
      }

      const rect = workflowComplete.getBoundingClientRect();
      const horizontal = (event.clientX - rect.left) / rect.width * 2 - 1;
      const vertical = (event.clientY - rect.top) / rect.height * 2 - 1;
      workflowComplete.style.setProperty('--complete-tilt-x', `${-vertical}deg`);
      workflowComplete.style.setProperty('--complete-tilt-y', `${horizontal * 2}deg`);
      workflowComplete.style.setProperty('--complete-tilt-z', `${horizontal}deg`);
    });

    workflowComplete.addEventListener('pointerleave', () => {
      workflowComplete.style.removeProperty('--complete-tilt-x');
      workflowComplete.style.removeProperty('--complete-tilt-y');
      workflowComplete.style.removeProperty('--complete-tilt-z');
    });
  }

  function promoteNextCard() {
    const nextCard = cards.find((card) => card.isConnected);

    if (!nextCard) {
      activeCard = null;
      workflowStack.style.removeProperty('min-height');
      workflowStack.classList.remove('is-card-promoting');
      return;
    }

    const startingRect = nextCard.getBoundingClientRect();
    const startingTransform = window.getComputedStyle(nextCard).transform;
    nextCard.style.animation = 'none';
    nextCard.classList.remove('workflow-card-back', 'workflow-card-back-left', 'workflow-card-back-right');
    nextCard.classList.add('is-active');
    activeCard = nextCard;

    if (reducedMotion.matches) {
      nextCard.style.removeProperty('transform');
      workflowStack.style.removeProperty('min-height');
      workflowStack.classList.remove('is-card-promoting');
      return;
    }

    nextCard.style.transform = startingTransform;
    const currentRect = nextCard.getBoundingClientRect();
    const translateX = startingRect.left + startingRect.width / 2 - currentRect.left - currentRect.width / 2;
    const translateY = startingRect.top + startingRect.height / 2 - currentRect.top - currentRect.height / 2;
    const scaleX = currentRect.width ? startingRect.width / currentRect.width : 1;
    const scaleY = currentRect.height ? startingRect.height / currentRect.height : 1;
    workflowStack.style.minHeight = `${nextCard.offsetHeight}px`;
    const baseTransform = startingTransform === 'none' ? '' : ` ${startingTransform}`;
    nextCard.classList.add('is-promoting');
    nextCard.style.transition = 'none';
    nextCard.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})${baseTransform}`;
    nextCard.getBoundingClientRect();
    nextCard.style.removeProperty('transition');

    let promotionTimeout;
    const finishPromotion = (event) => {
      if (event && (event.target !== nextCard || event.propertyName !== 'transform')) {
        return;
      }

      window.clearTimeout(promotionTimeout);
      nextCard.removeEventListener('transitionend', finishPromotion);
      nextCard.classList.remove('is-promoting');
      nextCard.style.removeProperty('transform');
      workflowStack.style.removeProperty('min-height');
      workflowStack.classList.remove('is-card-promoting');
    };

    nextCard.addEventListener('transitionend', finishPromotion);
    promotionTimeout = window.setTimeout(() => finishPromotion(), 850);
    window.requestAnimationFrame(() => {
      nextCard.style.transform = 'none';
    });
  }

  function removeCardAndPromote(card) {
    workflowStack.style.minHeight = `${workflowStack.offsetHeight}px`;
    workflowStack.classList.add('is-card-promoting');
    workflowStack.getBoundingClientRect();
    card.remove();
    promoteNextCard();
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
    const zoom = getEffectiveZoom(card);
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const layoutRect = {
      left: sourceRect.left / zoom,
      top: sourceRect.top / zoom,
      width: sourceRect.width / zoom,
      height: sourceRect.height / zoom,
    };
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
    const departmentClass = Array.from(card.classList).find((className) => className.startsWith('workflow-card-department-'));
    flightCard.className = `workflow-card ${departmentClass ?? ''} workflow-flight ${effectClass}`.trim();
    flightCard.setAttribute('aria-hidden', 'true');
    flightCard.style.animation = 'none';
    flightCard.style.transition = 'none';
    flightCard.style.zoom = String(zoom);
    flightCard.style.left = `${layoutRect.left + (layoutRect.width - cardWidth) / 2 - translateX}px`;
    flightCard.style.top = `${layoutRect.top + (layoutRect.height - cardHeight) / 2 - translateY}px`;
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
    const zoom = Number.parseFloat(flightCard.style.zoom) || 1;

    card.style.visibility = 'hidden';

    if (reducedMotion.matches) {
      flightCard.remove();
      removeCardAndPromote(card);
      onComplete();
      return;
    }

    const targetRect = projectDropZone.getBoundingClientRect();
    const cardWidth = flightCard.offsetWidth;
    const cardHeight = flightCard.offsetHeight;
    const startLeft = Number.parseFloat(flightCard.style.left);
    const startTop = Number.parseFloat(flightCard.style.top);
    const endScreenTop = (targetRect.top + targetRect.height / 2) / zoom - cardHeight / 2;
    const endScreenX = (targetRect.left + targetRect.width / 2) / zoom - cardWidth / 2;
    const originalTransform = flightCard.style.transform === 'none' ? '' : `${flightCard.style.transform} `;
    const startTime = performance.now();
    const duration = 1400;
    let hasPromotedNextCard = false;

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

      if (!hasPromotedNextCard && progress >= 0.55) {
        hasPromotedNextCard = true;
        removeCardAndPromote(card);
      }

      if (progress < 1) {
        window.requestAnimationFrame(frame);
        return;
      }
      flightCard.remove();
      if (!hasPromotedNextCard) {
        removeCardAndPromote(card);
      }
      onComplete();
    }

    window.requestAnimationFrame(frame);
  }

  function burnCard(card, sourceRect, onComplete, visualCard = card) {
    const departmentClass = Array.from(card.classList).find((className) => className.startsWith('workflow-card-department-'));
    const burningCard = visualCard === card
      ? createCardEffect(card, sourceRect, 'workflow-burn')
      : visualCard;
    burningCard.className = `workflow-card ${departmentClass ?? ''} workflow-flight workflow-burn`.trim();
    burningCard.setAttribute('aria-hidden', 'true');
    burningCard.style.animation = 'none';
    burningCard.style.transition = 'none';
    const zoom = Number.parseFloat(burningCard.style.zoom) || getEffectiveZoom(card);
    const cardStyle = window.getComputedStyle(burningCard);
    const cardWidth = burningCard.offsetWidth;
    const cardHeight = burningCard.offsetHeight;
    const bleed = 72;
    const sceneWidth = cardWidth + bleed * 2;
    const sceneHeight = cardHeight + bleed * 2;
    const sceneLeft = Number.parseFloat(burningCard.style.left) - bleed;
    const sceneTop = Number.parseFloat(burningCard.style.top) - bleed;
    const burnTransform = cardStyle.transform === 'none' ? '' : cardStyle.transform;
    const [originX, originY, originZ = '0px'] = cardStyle.transformOrigin.split(' ');
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const scene = document.createElementNS(svgNamespace, 'svg');
    scene.classList.add('workflow-burn-scene');
    scene.setAttribute('aria-hidden', 'true');
    scene.setAttribute('width', String(sceneWidth));
    scene.setAttribute('height', String(sceneHeight));
    scene.setAttribute('viewBox', `0 0 ${sceneWidth} ${sceneHeight}`);
    scene.style.left = `${sceneLeft}px`;
    scene.style.top = `${sceneTop}px`;
    scene.style.width = `${sceneWidth}px`;
    scene.style.height = `${sceneHeight}px`;
    scene.style.zoom = String(zoom);
    scene.style.transformBox = 'view-box';
    scene.style.transformOrigin = `${bleed + Number.parseFloat(originX)}px ${bleed + Number.parseFloat(originY)}px ${originZ}`;
    scene.style.transform = burnTransform || 'none';
    const defs = document.createElementNS(svgNamespace, 'defs');
    const clipId = `workflow-burn-${Math.random().toString(36).slice(2)}`;
    const shadowFilterId = `${clipId}-shadow`;
    const clipPath = document.createElementNS(svgNamespace, 'clipPath');
    clipPath.id = clipId;
    clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const clipShape = document.createElementNS(svgNamespace, 'path');
    clipShape.setAttribute('transform', `translate(${bleed} ${bleed})`);
    clipPath.append(clipShape);
    const shadowFilter = document.createElementNS(svgNamespace, 'filter');
    shadowFilter.id = shadowFilterId;
    shadowFilter.setAttribute('x', '-50%');
    shadowFilter.setAttribute('y', '-50%');
    shadowFilter.setAttribute('width', '200%');
    shadowFilter.setAttribute('height', '200%');
    shadowFilter.setAttribute('color-interpolation-filters', 'sRGB');
    const dropShadow = document.createElementNS(svgNamespace, 'feDropShadow');
    dropShadow.setAttribute('dx', '0');
    dropShadow.setAttribute('dy', '25');
    dropShadow.setAttribute('stdDeviation', '20');
    dropShadow.setAttribute('flood-color', '#000');
    dropShadow.setAttribute('flood-opacity', '0.26');
    shadowFilter.append(dropShadow);
    defs.append(clipPath);
    defs.append(shadowFilter);
    scene.append(defs);
    const cardGroup = document.createElementNS(svgNamespace, 'g');
    cardGroup.setAttribute('filter', `url(#${shadowFilterId})`);
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
    burningCard.className = `workflow-card ${departmentClass ?? ''} workflow-burn`.trim();
    burningCard.style.position = 'relative';
    burningCard.style.inset = 'auto';
    burningCard.style.width = `${cardWidth}px`;
    burningCard.style.height = `${cardHeight}px`;
    burningCard.style.margin = '0';
    burningCard.style.zoom = '1';
    burningCard.style.transform = 'none';
    burningCard.style.transformOrigin = 'center';
    burningCard.style.opacity = '1';
    cardWrapper.append(burningCard);
    cardSurface.append(cardWrapper);
    cardGroup.append(cardSurface);
    scene.append(cardGroup);
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
    const dpr = Math.min(window.devicePixelRatio, 1);
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
      removeCardAndPromote(card);
      onComplete();
      return;
    }

    if (reducedMotion.matches) {
      document.body.append(scene);
      removeCardAndPromote(card);
      scene.remove();
      onComplete();
      return;
    }

    let startTime = 0;
    const duration = 780;
    const width = cardWidth;
    const height = cardHeight;
    const sampleCount = Math.max(28, Math.ceil(width / 14));
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
        removeCardAndPromote(card);
        onComplete();
      }
    }

    clipShape.setAttribute('d', createBurnPath(edgePositions.map((_, index) => edgeAt(index, 0, 0))));
    document.body.append(scene);
    card.style.visibility = 'hidden';
    window.requestAnimationFrame((now) => {
      startTime = now;
      window.requestAnimationFrame(burnFrame);
    });
  }

  function chooseCard(card, approved, visualCard = card) {
    if (card !== activeCard || isChoosing) {
      return;
    }

    if (isLastCard(card)) {
      showWorkflowComplete(card);
    }

    isChoosing = true;
    updateCardAvailability();
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
        approvedCardCount += 1;
        projectStatus.textContent = `Добавлено в «Ваш проект»: ${title}.`;
      } else {
        projectStatus.textContent = `Карточка сожжена: ${title}.`;
      }

      isChoosing = false;
      updateCardAvailability();

      if (!activeCard) {
        showWorkflowComplete(card, true);
      }
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

  const workflowInfoDialog = document.querySelector('.workflow-info-dialog');

  if (workflowInfoDialog) {
    const infoTitle = workflowInfoDialog.querySelector('#workflow-info-title');
    const infoDescription = workflowInfoDialog.querySelector('.workflow-info-description');
    const infoTime = workflowInfoDialog.querySelector('[data-workflow-info-time]');
    const infoCost = workflowInfoDialog.querySelector('[data-workflow-info-cost]');
    const closeButton = workflowInfoDialog.querySelector('.workflow-info-close');

    workflowStack.addEventListener('click', (event) => {
      const infoButton = event.target.closest('.workflow-info-button');
      const card = infoButton?.closest('.workflow-card');

      if (!infoButton || !card) {
        return;
      }

      infoTitle.textContent = card.dataset.projectTitle;
      infoDescription.textContent = card.dataset.projectDescription;
      infoTime.textContent = card.dataset.projectTime;
      infoCost.textContent = card.dataset.projectCost;
      workflowInfoDialog.showModal();
    });

    closeButton.addEventListener('click', () => workflowInfoDialog.close());
    workflowInfoDialog.addEventListener('click', (event) => {
      if (event.target === workflowInfoDialog) {
        workflowInfoDialog.close();
      }
    });
  }

  workflowStack.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.workflow-card.is-active');

    if (!card || event.target.closest('.workflow-info-button') || event.button !== 0 || isChoosing) {
      return;
    }

    window.clearTimeout(swipeHintTimeout);
    swipeHintCleanup?.();

    drag = {
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocityX: 0,
      rect: card.getBoundingClientRect(),
      zoom: getEffectiveZoom(card),
      previousVisibility: card.style.visibility,
      previousAnimation: card.style.animation,
    };
    card.classList.remove('is-tilting');
    card.style.animation = 'none';
    const ghost = card.cloneNode(true);
    const departmentClass = Array.from(card.classList).find((className) => className.startsWith('workflow-card-department-'));
    ghost.className = `workflow-card ${departmentClass ?? ''} workflow-drag-ghost is-dragging`.trim();
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.zoom = String(drag.zoom);
    ghost.style.left = `${drag.rect.left / drag.zoom}px`;
    ghost.style.top = `${drag.rect.top / drag.zoom}px`;
    ghost.style.width = `${drag.rect.width / drag.zoom}px`;
    ghost.style.height = `${drag.rect.height / drag.zoom}px`;
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

      updateDragVisual(drag.ghost, drag.rect, deltaX, deltaY, drag.zoom);
      return;
    }

    const card = event.target.closest('.workflow-card.is-active');

    if (card && event.pointerType !== 'touch' && isLastCard(card)) {
      showWorkflowComplete(card);
    }

    if (!card || event.pointerType === 'touch' || isChoosing) {
      return;
    }

    const rect = card.getBoundingClientRect();
    const horizontal = (event.clientX - rect.left) / rect.width * 2 - 1;
    const vertical = (event.clientY - rect.top) / rect.height * 2 - 1;
    card.style.setProperty('--tilt-x', `${-vertical}deg`);
    card.style.setProperty('--tilt-y', `${horizontal * 2}deg`);
    card.style.setProperty('--tilt-z', `${horizontal}deg`);
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

  updateCardAvailability();
}
