"use strict";

(function () {
  function formatRupiah(value) {
    var angka = Number(String(value === undefined || value === null ? "" : value).replace(/\D/g, ""));
    if (!angka) return "Rp 0";
    return "Rp " + angka.toLocaleString("id-ID");
  }

  function formatTanggal(value) {
    var tanggal = new Date(value);
    if (isNaN(tanggal.getTime())) return "";
    return tanggal.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  function ambilDonasi() {
    return fetch("/api/donatur", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  function setNote(el, text, state) {
    if (!el) return;
    el.textContent = text;
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  }

  /* ---------------- Beranda: angka donasi ---------------- */

  var terkumpulEl = document.getElementById("donasi-terkumpul");

  if (terkumpulEl) {
    ambilDonasi()
      .then(function (data) {
        var targetEl = document.getElementById("donasi-target");
        var barEl = document.getElementById("donasi-bar");
        var persenEl = document.getElementById("donasi-persen");
        terkumpulEl.textContent = formatRupiah(data.terkumpul);
        if (targetEl) targetEl.textContent = formatRupiah(data.target);
        if (barEl) barEl.style.width = data.persen + "%";
        if (persenEl) persenEl.textContent = data.persen + "% dari target";
      })
      .catch(function () {});
  }

  /* ---------------- Halaman /donatur ---------------- */

  var grid = document.getElementById("donatur-grid");

  if (grid) {
    var kosong = document.getElementById("donatur-empty");
    var jumlahEl = document.getElementById("donatur-jumlah");
    var totalEl = document.getElementById("donatur-total");
    var targetElPage = document.getElementById("donatur-target");
    var persenElPage = document.getElementById("donatur-persen");
    var barElPage = document.getElementById("donatur-bar");

    var buatKartu = function (item) {
      var card = document.createElement("article");
      card.className = "card donatur-card";

      var head = document.createElement("div");
      head.className = "donatur-head";

      var nama = document.createElement("h3");
      nama.className = "donatur-nama";
      nama.textContent = item.nama;

      var jumlah = document.createElement("span");
      jumlah.className = "donatur-jumlah";
      jumlah.textContent = formatRupiah(item.jumlah);

      head.appendChild(nama);
      head.appendChild(jumlah);
      card.appendChild(head);

      if (item.pesan) {
        var pesan = document.createElement("p");
        pesan.className = "donatur-pesan";
        pesan.textContent = "“" + item.pesan + "”";
        card.appendChild(pesan);
      }

      if (item.at) {
        var waktu = document.createElement("p");
        waktu.className = "donatur-waktu";
        waktu.textContent = formatTanggal(item.at);
        card.appendChild(waktu);
      }

      return card;
    };

    var renderDonatur = function (data) {
      grid.textContent = "";
      (data.items || []).forEach(function (item) {
        grid.appendChild(buatKartu(item));
      });
      if (jumlahEl) jumlahEl.textContent = data.count || 0;
      if (totalEl) totalEl.textContent = formatRupiah(data.terkumpul);
      if (targetElPage) targetElPage.textContent = formatRupiah(data.target);
      if (persenElPage) persenElPage.textContent = data.persen + "% dari target";
      if (barElPage) barElPage.style.width = data.persen + "%";
      if (kosong) kosong.hidden = (data.items || []).length > 0;
    };

    ambilDonasi()
      .then(renderDonatur)
      .catch(function () {
        if (kosong) {
          kosong.textContent = "Gagal memuat daftar donatur. Coba muat ulang halaman.";
          kosong.hidden = false;
        }
      });
  }

  /* ---------------- Halaman /dapur-lp201 ---------------- */

  var formDonatur = document.getElementById("form-donatur");

  if (formDonatur) {
    var namaInput = document.getElementById("donatur-nama");
    var jumlahInput = document.getElementById("donatur-jumlah");
    var pesanInput = document.getElementById("donatur-pesan");
    var submitDonatur = document.getElementById("donatur-submit");
    var cancelDonatur = document.getElementById("donatur-cancel");
    var noteDonatur = document.getElementById("donatur-note");
    var titleDonatur = document.getElementById("donatur-form-title");
    var listDapur = document.getElementById("dapur-list");
    var emptyDapur = document.getElementById("dapur-empty");
    var ringkasDapur = document.getElementById("dapur-ringkas");
    var refreshDapur = document.getElementById("dapur-refresh");

    var formPengaturan = document.getElementById("form-pengaturan");
    var targetInput = document.getElementById("target-donasi");
    var awalInput = document.getElementById("donasi-awal");
    var submitPengaturan = document.getElementById("pengaturan-submit");
    var notePengaturan = document.getElementById("pengaturan-note");

    var editingId = null;

    function resetFormDonatur() {
      editingId = null;
      formDonatur.reset();
      titleDonatur.textContent = "Tambah donatur";
      submitDonatur.textContent = "Simpan donatur";
      cancelDonatur.hidden = true;
    }

    function isiFormDonatur(item) {
      editingId = item.id;
      namaInput.value = item.nama;
      jumlahInput.value = item.jumlah;
      pesanInput.value = item.pesan;
      titleDonatur.textContent = "Edit donatur";
      submitDonatur.textContent = "Simpan perubahan";
      cancelDonatur.hidden = false;
      setNote(noteDonatur, "Sedang mengedit: " + item.nama, "");
      namaInput.focus();
    }

    function buatBaris(item) {
      var row = document.createElement("article");
      row.className = "dapur-item";

      var top = document.createElement("div");
      top.className = "dapur-item-top";

      var nama = document.createElement("strong");
      nama.textContent = item.nama;

      var jumlah = document.createElement("span");
      jumlah.className = "donatur-jumlah";
      jumlah.textContent = formatRupiah(item.jumlah);

      top.appendChild(nama);
      top.appendChild(jumlah);
      row.appendChild(top);

      if (item.pesan) {
        var pesan = document.createElement("p");
        pesan.className = "dapur-item-pesan";
        pesan.textContent = item.pesan;
        row.appendChild(pesan);
      }

      var meta = document.createElement("p");
      meta.className = "donatur-waktu";
      meta.textContent = formatTanggal(item.at);
      row.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "dapur-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--sun btn--sm";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        isiFormDonatur(item);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      var hapusBtn = document.createElement("button");
      hapusBtn.type = "button";
      hapusBtn.className = "btn btn--ghost btn--sm";
      hapusBtn.textContent = "Hapus";
      hapusBtn.addEventListener("click", function () {
        if (!window.confirm("Hapus donatur " + item.nama + "?")) return;
        fetch("/api/donatur/" + item.id, { method: "DELETE" })
          .then(function (response) {
            return response.json().then(function (payload) {
              return { ok: response.ok, payload: payload };
            });
          })
          .then(function (result) {
            if (!result.ok || !result.payload.ok) throw new Error(result.payload.error || "Gagal menghapus.");
            if (editingId === item.id) resetFormDonatur();
            setNote(noteDonatur, "Donatur dihapus.", "success");
            muatDapur();
          })
          .catch(function (error) {
            setNote(noteDonatur, error.message || "Gagal menghapus donatur.", "error");
          });
      });

      actions.appendChild(editBtn);
      actions.appendChild(hapusBtn);
      row.appendChild(actions);

      return row;
    }

    function renderDapur(data) {
      listDapur.textContent = "";
      (data.items || []).forEach(function (item) {
        listDapur.appendChild(buatBaris(item));
      });
      if (emptyDapur) emptyDapur.hidden = (data.items || []).length > 0;
      if (ringkasDapur) {
        ringkasDapur.textContent =
          formatRupiah(data.terkumpul) +
          " terkumpul dari target " +
          formatRupiah(data.target) +
          " (" +
          data.persen +
          "%). Di luar daftar nama: " +
          formatRupiah(data.donasiAwal) +
          " · total donatur tercatat: " +
          formatRupiah(data.totalDonatur) +
          ".";
      }
      if (targetInput && document.activeElement !== targetInput) targetInput.value = data.target || "";
      if (awalInput && document.activeElement !== awalInput) awalInput.value = data.donasiAwal || "";
    }

    function muatDapur() {
      return ambilDonasi()
        .then(renderDapur)
        .catch(function () {
          if (emptyDapur) {
            emptyDapur.textContent = "Gagal memuat data dari database.";
            emptyDapur.hidden = false;
          }
        });
    }

    formDonatur.addEventListener("submit", function (event) {
      event.preventDefault();

      var nama = namaInput.value.trim();
      if (!nama) {
        setNote(noteDonatur, "Nama donatur wajib diisi.", "error");
        namaInput.focus();
        return;
      }

      var payload = {
        nama: nama,
        jumlah: jumlahInput.value,
        pesan: pesanInput.value.trim()
      };

      var target = editingId ? "/api/donatur/" + editingId : "/api/donatur";
      var method = editingId ? "PUT" : "POST";

      submitDonatur.disabled = true;
      setNote(noteDonatur, "Menyimpan…", "");

      fetch(target, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, payload: body };
          });
        })
        .then(function (result) {
          if (!result.ok || !result.payload.ok) {
            throw new Error(result.payload.error || "Gagal menyimpan donatur.");
          }
          setNote(
            noteDonatur,
            editingId ? "Perubahan donatur tersimpan." : "Donatur baru tersimpan.",
            "success"
          );
          resetFormDonatur();
          return muatDapur();
        })
        .catch(function (error) {
          setNote(noteDonatur, error.message || "Gagal menyimpan donatur.", "error");
        })
        .then(function () {
          submitDonatur.disabled = false;
        });
    });

    cancelDonatur.addEventListener("click", function () {
      resetFormDonatur();
      setNote(noteDonatur, "", "");
    });

    formPengaturan.addEventListener("submit", function (event) {
      event.preventDefault();

      var target = targetInput.value;
      if (!Number(target)) {
        setNote(notePengaturan, "Isi target donasi dulu ya.", "error");
        targetInput.focus();
        return;
      }

      submitPengaturan.disabled = true;
      setNote(notePengaturan, "Menyimpan…", "");

      fetch("/api/pengaturan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: target, donasiAwal: awalInput.value })
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, payload: body };
          });
        })
        .then(function (result) {
          if (!result.ok || !result.payload.ok) {
            throw new Error(result.payload.error || "Gagal menyimpan target.");
          }
          setNote(notePengaturan, "Target donasi tersimpan.", "success");
          return muatDapur();
        })
        .catch(function (error) {
          setNote(notePengaturan, error.message || "Gagal menyimpan target.", "error");
        })
        .then(function () {
          submitPengaturan.disabled = false;
        });
    });

    refreshDapur.addEventListener("click", muatDapur);
    muatDapur();
  }
})();
