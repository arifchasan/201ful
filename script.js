/* 201FUL / LP201 — light interactions for the MVP */
(function () {
  "use strict";

  /* ---------------- Mobile navigation ---------------- */
  var header = document.getElementById("site-header");
  var nav = document.getElementById("primary-nav");
  var navToggle = document.getElementById("nav-toggle");

  function setNav(open) {
    if (!nav || !navToggle) return;
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  }

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      setNav(navToggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a, button")) setNav(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        setNav(false);
        navToggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 720) setNav(false);
    });
  }

  /* ---------------- Sticky header shadow ---------------- */
  function onScroll() {
    if (header) header.classList.toggle("is-stuck", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- Seamless tagline marquee ---------------- */
  var marquee = document.querySelector(".marquee");
  var marqueeTrack = marquee ? marquee.querySelector(".marquee-track") : null;

  if (marquee && marqueeTrack) {
    var marqueeSeedHTML = marqueeTrack.innerHTML;
    var marqueeItems = Array.prototype.slice.call(marqueeTrack.children).map(function (node) {
      return node.cloneNode(true);
    });

    var buildMarquee = function () {
      if (!marqueeItems.length) return;

      Array.prototype.forEach.call(
        marquee.querySelectorAll("[data-marquee-clone]"),
        function (node) {
          node.remove();
        }
      );
      marqueeTrack.innerHTML = marqueeSeedHTML;

      var viewport = marquee.clientWidth || window.innerWidth;
      var guard = 0;
      while (marqueeTrack.getBoundingClientRect().width < viewport * 1.1 && guard < 12) {
        marqueeItems.forEach(function (node) {
          marqueeTrack.appendChild(node.cloneNode(true));
        });
        guard += 1;
      }

      var copy = marqueeTrack.cloneNode(true);
      copy.setAttribute("data-marquee-clone", "true");
      marquee.appendChild(copy);

      var width = marqueeTrack.getBoundingClientRect().width;
      marquee.style.setProperty("--marquee-duration", Math.max(14, width / 80).toFixed(1) + "s");
    };

    buildMarquee();

    var marqueeResize;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(marqueeResize);
        marqueeResize = window.setTimeout(buildMarquee, 200);
      },
      { passive: true }
    );
  }

  /* ---------------- Active nav link ---------------- */
  var navLinks = nav
    ? Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]:not(.nav-cta)'))
    : [];
  var sections = navLinks
    .map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            link.classList.toggle(
              "is-active",
              link.getAttribute("href") === "#" + entry.target.id
            );
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (section) {
      navObserver.observe(section);
    });
  }

  /* ---------------- Reveal on scroll ---------------- */
  var revealItems = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-in");
    });
  }

  /* ---------------- Countdown to the event ---------------- */
  var countdown = document.querySelector("[data-countdown]");
  if (countdown) {
    var target = new Date("2026-12-10T08:30:00+07:00").getTime();
    var fields = {
      days: countdown.querySelector("[data-days]"),
      hours: countdown.querySelector("[data-hours]"),
      minutes: countdown.querySelector("[data-minutes]"),
      seconds: countdown.querySelector("[data-seconds]")
    };

    var pad = function (n) {
      return String(n).padStart(2, "0");
    };

    var tick = function () {
      var diff = target - Date.now();
      if (diff <= 0) {
        countdown.innerHTML =
          '<p class="countdown-label">Menuju hari-H</p><p class="countdown-done">Hari yang wow sedang berlangsung ✨</p>';
        clearInterval(timer);
        return;
      }
      var s = Math.floor(diff / 1000);
      fields.days.textContent = pad(Math.floor(s / 86400));
      fields.hours.textContent = pad(Math.floor((s % 86400) / 3600));
      fields.minutes.textContent = pad(Math.floor((s % 3600) / 60));
      fields.seconds.textContent = pad(s % 60);
    };

    tick();
    var timer = setInterval(tick, 1000);
  }

  /* ---------------- Copy bank account ---------------- */
  var copyButton = document.getElementById("copy-rekening");
  var copyNote = document.getElementById("copy-note");

  if (copyButton) {
    copyButton.addEventListener("click", function () {
      var account = "901108162197";
      var done = function () {
        copyNote.textContent = "Nomor rekening tersalin.";
        setTimeout(function () {
          copyNote.textContent = "";
        }, 3000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(account).then(done, done);
      } else {
        done();
      }
    });
  }
})();
