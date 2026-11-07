"use strict";

(function () {
  var grid = document.getElementById("galeri-grid");
  var lightbox = document.getElementById("galeri-lightbox");

  if (!grid || !lightbox) return;

  var items = Array.prototype.slice.call(grid.querySelectorAll(".galeri-item"));
  if (!items.length) return;

  var gambar = lightbox.querySelector(".lightbox-gambar");
  var keterangan = lightbox.querySelector(".lightbox-keterangan");
  var hitung = lightbox.querySelector(".lightbox-hitung");
  var tombolTutup = lightbox.querySelector(".lightbox-tutup");
  var tombolSebelum = lightbox.querySelector(".lightbox-nav--sebelum");
  var tombolSesudah = lightbox.querySelector(".lightbox-nav--sesudah");

  var aktif = 0;
  var fokusTerakhir = null;

  function tampilkan(nomor) {
    aktif = (nomor + items.length) % items.length;

    var item = items[aktif];
    var img = item.querySelector("img");
    var src = img.currentSrc || img.src;

    gambar.src = src;
    gambar.alt = img.alt || "";
    keterangan.textContent = img.alt || "";
    hitung.textContent = aktif + 1 + " / " + items.length;

    /* Muat gambar berikutnya lebih dulu supaya geser terasa mulus. */
    var berikut = items[(aktif + 1) % items.length].querySelector("img");
    if (berikut && !berikut.dataset.siap) {
      var pramuat = new Image();
      pramuat.src = berikut.src;
      berikut.dataset.siap = "1";
    }
  }

  function buka(nomor) {
    fokusTerakhir = document.activeElement;
    tampilkan(nomor);
    lightbox.hidden = false;
    document.body.classList.add("lightbox-terbuka");
    if (tombolTutup) tombolTutup.focus();
  }

  function tutup() {
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-terbuka");
    gambar.removeAttribute("src");
    if (fokusTerakhir && typeof fokusTerakhir.focus === "function") fokusTerakhir.focus();
  }

  items.forEach(function (item, index) {
    item.addEventListener("click", function (event) {
      event.preventDefault();
      buka(index);
    });
  });

  if (tombolTutup) tombolTutup.addEventListener("click", tutup);
  if (tombolSebelum) {
    tombolSebelum.addEventListener("click", function () {
      tampilkan(aktif - 1);
    });
  }
  if (tombolSesudah) {
    tombolSesudah.addEventListener("click", function () {
      tampilkan(aktif + 1);
    });
  }

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) tutup();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      tutup();
    } else if (event.key === "ArrowLeft") {
      tampilkan(aktif - 1);
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      tampilkan(aktif + 1);
      event.preventDefault();
    }
  });

  /* Geser dengan jari di ponsel. */
  var mulaiX = 0;

  lightbox.addEventListener(
    "touchstart",
    function (event) {
      if (event.touches.length !== 1) return;
      mulaiX = event.touches[0].clientX;
    },
    { passive: true }
  );

  lightbox.addEventListener(
    "touchend",
    function (event) {
      if (!mulaiX) return;
      var selisih = event.changedTouches[0].clientX - mulaiX;
      mulaiX = 0;
      if (Math.abs(selisih) < 45) return;
      tampilkan(selisih > 0 ? aktif - 1 : aktif + 1);
    },
    { passive: true }
  );
})();
