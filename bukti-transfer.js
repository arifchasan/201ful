"use strict";

(function () {
  var MAX_BYTES = 8 * 1024 * 1024;
  var ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  function formatRupiah(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return "Rp " + Number(digits).toLocaleString("id-ID");
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  }

  /* ---------------- Halaman upload ---------------- */

  var form = document.getElementById("bukti-form");

  if (form) {
    var note = document.getElementById("bukti-note");
    var submit = document.getElementById("bukti-submit");
    var fileInput = document.getElementById("bukti");
    var preview = document.getElementById("bukti-preview");
    var previewImg = document.getElementById("bukti-preview-img");
    var successDialog = document.getElementById("bukti-success");
    var successClose = document.getElementById("bukti-success-close");
    var objectUrl = null;

    if (successClose && successDialog) {
      successClose.addEventListener("click", function () {
        successDialog.close();
      });
      successDialog.addEventListener("click", function (event) {
        if (event.target === successDialog) successDialog.close();
      });
    }

    function setNote(text, state) {
      if (!note) return;
      note.textContent = text;
      if (state) note.dataset.state = state;
      else delete note.dataset.state;
    }

    function clearPreview() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      previewImg.removeAttribute("src");
      preview.classList.remove("is-visible");
    }

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      clearPreview();

      if (!file) {
        setNote("", "");
        return;
      }
      if (ALLOWED.indexOf(file.type) === -1) {
        fileInput.value = "";
        setNote("File harus berupa gambar JPG, PNG, WEBP, atau GIF.", "error");
        return;
      }
      if (file.size > MAX_BYTES) {
        fileInput.value = "";
        setNote("Ukuran gambar maksimal 8 MB. Coba foto lain atau kecilkan dulu.", "error");
        return;
      }

      objectUrl = URL.createObjectURL(file);
      previewImg.src = objectUrl;
      preview.classList.add("is-visible");
      setNote("Siap dikirim: " + file.name, "");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var nama = form.elements.nama.value.trim();
      var file = fileInput.files && fileInput.files[0];

      if (!nama) {
        setNote("Isi nama donatur dulu ya.", "error");
        form.elements.nama.focus();
        return;
      }
      if (!file) {
        setNote("Pilih foto bukti transfer dulu.", "error");
        fileInput.focus();
        return;
      }
      if (ALLOWED.indexOf(file.type) === -1) {
        setNote("File harus berupa gambar JPG, PNG, WEBP, atau GIF.", "error");
        return;
      }
      if (file.size > MAX_BYTES) {
        setNote("Ukuran gambar maksimal 8 MB.", "error");
        return;
      }

      var data = new FormData();
      data.append("nama", nama);
      data.append("nominal", form.elements.nominal.value);
      data.append("catatan", form.elements.catatan.value);
      data.append("bukti", file, file.name);

      var label = submit.textContent;
      submit.disabled = true;
      submit.textContent = "Mengirim…";
      setNote("Mengunggah bukti transfer…", "");

      fetch("/api/bukti-transfer", { method: "POST", body: data })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (payload) {
              return { ok: response.ok, status: response.status, payload: payload };
            });
        })
        .then(function (result) {
          if (!result.ok || !result.payload.ok) {
            throw new Error(result.payload.error || "Bukti gagal dikirim (" + result.status + ").");
          }
          form.reset();
          clearPreview();
          setNote("Terima kasih! Bukti transfer diterima dan akan dicek divisi Finance.", "success");
          if (successDialog && typeof successDialog.showModal === "function") {
            successDialog.showModal();
          } else {
            window.alert(
              "Bukti transfer terkirim!\n\nTerima kasih. Bukti kamu akan dicek divisi Finance."
            );
          }
        })
        .catch(function (error) {
          setNote(error.message || "Bukti gagal dikirim. Coba lagi ya.", "error");
        })
        .then(function () {
          submit.disabled = false;
          submit.textContent = label;
        });
    });
  }

  /* ---------------- Halaman cek ---------------- */

  var grid = document.getElementById("bukti-grid");

  if (grid) {
    var countEl = document.getElementById("bukti-count");
    var emptyEl = document.getElementById("bukti-empty");
    var refresh = document.getElementById("bukti-refresh");

    function buildItem(item) {
      var card = document.createElement("article");
      card.className = "card bukti-item";

      var thumb = document.createElement("a");
      thumb.className = "bukti-item-thumb";
      thumb.href = item.url;
      thumb.target = "_blank";
      thumb.rel = "noopener";

      var img = document.createElement("img");
      img.src = item.url;
      img.alt = "Bukti transfer " + (item.nama || "donatur");
      img.loading = "lazy";
      thumb.appendChild(img);
      card.appendChild(thumb);

      var name = document.createElement("h3");
      name.textContent = item.nama || "Tanpa nama";
      card.appendChild(name);

      var meta = document.createElement("p");
      meta.className = "bukti-meta";

      var nominal = document.createElement("span");
      nominal.className = "bukti-nominal";
      nominal.textContent = item.nominal ? formatRupiah(item.nominal) : "Nominal belum diisi";

      var when = document.createElement("span");
      when.textContent = formatDate(item.at);

      meta.appendChild(nominal);
      meta.appendChild(when);
      card.appendChild(meta);

      if (item.catatan) {
        var catatan = document.createElement("p");
        catatan.className = "bukti-catatan";
        catatan.textContent = item.catatan;
        card.appendChild(catatan);
      }

      return card;
    }

    function load() {
      countEl.textContent = "Memuat…";
      emptyEl.hidden = true;
      grid.textContent = "";

      fetch("/api/bukti-transfer", { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          var items = (data && data.items) || [];
          grid.textContent = "";
          items.forEach(function (item) {
            grid.appendChild(buildItem(item));
          });
          countEl.textContent = items.length
            ? items.length + " bukti transfer"
            : "Belum ada bukti transfer";
          emptyEl.hidden = items.length > 0;
        })
        .catch(function () {
          grid.textContent = "";
          countEl.textContent = "";
          emptyEl.textContent = "Gagal memuat daftar bukti transfer. Coba muat ulang.";
          emptyEl.hidden = false;
        });
    }

    refresh.addEventListener("click", load);
    load();
  }
})();
