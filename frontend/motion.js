export function setupAmbientPointer() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;

  if (prefersReducedMotion || !supportsFinePointer) {
    return;
  }

  let rafId = 0;

  window.addEventListener(
    "pointermove",
    (event) => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const x = `${(event.clientX / window.innerWidth) * 100}%`;
        const y = `${(event.clientY / window.innerHeight) * 100}%`;

        document.documentElement.style.setProperty("--pointer-x", x);
        document.documentElement.style.setProperty("--pointer-y", y);
      });
    },
    { passive: true }
  );
}

export function setupScrollReveal() {
  const targets = Array.from(
    document.querySelectorAll(
      [
        ".topbar",
        ".hero-copy",
        ".highlight-list",
        ".metric-card",
        ".orbit-panel",
        ".section-heading",
        ".capability-card",
        ".studio .panel",
        ".telemetry-card",
        ".operations-sidebar",
        ".operations-table-panel",
        ".operations-detail-panel"
      ].join(",")
    )
  );

  if (!targets.length) {
    return;
  }

  targets.forEach((target, index) => {
    target.classList.add("reveal-on-scroll");
    target.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 80}ms`);
  });

  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  targets.forEach((target) => observer.observe(target));
}

export function setupSectionSpy() {
  const links = Array.from(document.querySelectorAll(".topnav a"));
  if (!links.length) {
    return;
  }

  const sectionEntries = [];
  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href?.startsWith("#")) {
      continue;
    }

    const section = document.querySelector(href);
    if (section) {
      sectionEntries.push({ link, section, href });
    }
  }

  if (!sectionEntries.length) {
    return;
  }

  function activateLink(activeLink) {
    for (const link of links) {
      link.classList.toggle("is-current", link === activeLink);
    }
  }

  function getEntryByHash(hash = window.location.hash) {
    if (!hash) {
      return null;
    }

    return sectionEntries.find((entry) => entry.href === hash) ?? null;
  }

  function activateLinkByHash(hash = window.location.hash) {
    const matchedEntry = getEntryByHash(hash);
    if (!matchedEntry) {
      return false;
    }

    activateLink(matchedEntry.link);
    return true;
  }

  function getTopbarOffset() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) {
      return 0;
    }

    const computedStyle = window.getComputedStyle(topbar);
    const isSticky = computedStyle.position === "sticky";
    const topOffset = Number.parseFloat(computedStyle.top || "0");
    return isSticky ? topbar.getBoundingClientRect().height + topOffset + 16 : 24;
  }

  function scrollToSection(section) {
    const top = Math.max(0, window.scrollY + section.getBoundingClientRect().top - getTopbarOffset());
    window.scrollTo({
      top,
      behavior: "smooth"
    });
  }

  function updateActiveLink() {
    const checkpoint = window.scrollY + getTopbarOffset();
    let activeLink = sectionEntries[0].link;

    for (const entry of sectionEntries) {
      if (entry.section.offsetTop - 24 <= checkpoint) {
        activeLink = entry.link;
      }
    }

    activateLink(activeLink);
  }

  let rafId = 0;
  function requestActiveLinkUpdate() {
    if (rafId) {
      return;
    }

    rafId = requestAnimationFrame(() => {
      rafId = 0;
      updateActiveLink();
    });
  }

  for (const entry of sectionEntries) {
    entry.link.addEventListener("click", (event) => {
      event.preventDefault();
      activateLink(entry.link);

      if (window.location.hash !== entry.href) {
        history.pushState(null, "", entry.href);
      }

      scrollToSection(entry.section);
    });
  }

  window.addEventListener("scroll", requestActiveLinkUpdate, { passive: true });
  window.addEventListener("resize", requestActiveLinkUpdate);
  window.addEventListener("hashchange", () => {
    activateLinkByHash();
    requestActiveLinkUpdate();
  });
  window.addEventListener("load", () => {
    const entry = getEntryByHash();
    if (entry) {
      activateLink(entry.link);
      scrollToSection(entry.section);
      return;
    }

    requestActiveLinkUpdate();
  });

  if (!activateLinkByHash()) {
    updateActiveLink();
  }

  requestAnimationFrame(() => {
    requestActiveLinkUpdate();
  });
}
