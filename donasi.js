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

  /* Peringkat donasi terbesar: emas, perak, perunggu. */
  var PERINGKAT = [
    { kelas: "emas", label: "Emas" },
    { kelas: "perak", label: "Perak" },
    { kelas: "perunggu", label: "Perunggu" }
  ];

  function buatMahkota(nomor, konteks) {
    var data = PERINGKAT[nomor - 1];
    if (!data) return null;

    var badge = document.createElement("span");
    badge.className = "mahkota mahkota--" + data.kelas;
    badge.setAttribute(
      "aria-label",
      (konteks || "Donasi terbesar") + " peringkat " + nomor + ", medali " + data.label
    );
    badge.innerHTML =
      '<svg class="mahkota-ikon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M3.2 8.6l4.2 3 4.6-6.4 4.6 6.4 4.2-3-1.6 9a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8l-1.6-9z" fill="currentColor"/>' +
      '<circle cx="3" cy="6.6" r="1.8" fill="currentColor"/>' +
      '<circle cx="21" cy="6.6" r="1.8" fill="currentColor"/>' +
      '<circle cx="12" cy="3.6" r="1.8" fill="currentColor"/>' +
      "</svg>";

    return badge;
  }

  function peringkatDari(item, urutan) {
    if (urutan > 3) return 0;
    var jumlah = Number(String(item.jumlah === undefined || item.jumlah === null ? "" : item.jumlah).replace(/\D/g, ""));
    return jumlah > 0 ? urutan : 0;
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

  function sesiHabis(noteEl) {
    setNote(noteEl, "Kata sandi dapur sudah tidak berlaku. Halaman dimuat ulang supaya bisa masuk lagi.", "error");
    window.setTimeout(function () {
      window.location.reload();
    }, 1500);
  }

  /* ---------------- Keluar dari dapur ---------------- */

  var tombolKeluar = document.getElementById("dapur-logout");

  if (tombolKeluar) {
    tombolKeluar.addEventListener("click", function () {
      tombolKeluar.disabled = true;
      fetch("/api/dapur/logout", { method: "POST" })
        .catch(function () {})
        .then(function () {
          window.location.href = "/";
        });
    });
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

  /* ---------------- Halaman /donatur: daftar donatur ---------------- */

  var daftarGrid = document.getElementById("donatur-grid");

  if (daftarGrid) {
    var daftarKosong = document.getElementById("donatur-empty");
    var daftarJumlah = document.getElementById("donatur-jumlah");
    var daftarTotal = document.getElementById("donatur-total");
    var daftarTarget = document.getElementById("donatur-target");
    var daftarPersen = document.getElementById("donatur-persen");
    var daftarBar = document.getElementById("donatur-bar");

    var buatKartuDonatur = function (item, urutan) {
      var card = document.createElement("article");
      card.className = "card donatur-card";

      var peringkat = peringkatDari(item, urutan);
      if (peringkat) {
        card.className += " donatur-card--juara donatur-card--" + PERINGKAT[peringkat - 1].kelas;
        card.appendChild(buatMahkota(peringkat));
      }

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

    ambilDonasi()
      .then(function (data) {
        daftarGrid.textContent = "";
        (data.items || []).forEach(function (item, index) {
          daftarGrid.appendChild(buatKartuDonatur(item, index + 1));
        });
        if (daftarJumlah) daftarJumlah.textContent = data.count || 0;
        if (daftarTotal) daftarTotal.textContent = formatRupiah(data.terkumpul);
        if (daftarTarget) daftarTarget.textContent = formatRupiah(data.target);
        if (daftarPersen) daftarPersen.textContent = data.persen + "% dari target";
        if (daftarBar) daftarBar.style.width = data.persen + "%";
        if (daftarKosong) daftarKosong.hidden = (data.items || []).length > 0;
      })
      .catch(function () {
        if (daftarKosong) {
          daftarKosong.textContent = "Gagal memuat daftar donatur. Coba muat ulang halaman.";
          daftarKosong.hidden = false;
        }
      });
  }

  /* ---------------- Halaman /donatur-internal: papan peringkat referal ---------------- */

  var referalList = document.getElementById("referal-list");

  if (referalList) {
    var referalEmpty = document.getElementById("referal-empty");
    var referalTanpaWrap = document.getElementById("referal-tanpa");
    var referalTanpaBtn = document.getElementById("referal-tanpa-btn");
    var referalTanpaDetail = document.getElementById("referal-tanpa-detail");
    var referalTanpaMeta = document.getElementById("referal-tanpa-meta");
    var referalTanpaTotal = document.getElementById("referal-tanpa-total");
    var jumlahEl = document.getElementById("donatur-jumlah");
    var totalEl = document.getElementById("donatur-total");
    var targetElPage = document.getElementById("donatur-target");
    var persenElPage = document.getElementById("donatur-persen");
    var barElPage = document.getElementById("donatur-bar");

    var formatAngka = function (nilai) {
      return Number(String(nilai === undefined || nilai === null ? "" : nilai).replace(/\D/g, ""));
    };

    var buatDetailDonatur = function (daftar) {
      var list = document.createElement("ul");
      list.className = "referal-donor-list";

      daftar.forEach(function (donatur) {
        var li = document.createElement("li");
        li.className = "referal-donor";

        var head = document.createElement("div");
        head.className = "referal-donor-head";

        var nama = document.createElement("span");
        nama.className = "referal-donor-nama";
        nama.textContent = donatur.nama;

        var jumlah = document.createElement("b");
        jumlah.className = "referal-donor-jumlah";
        jumlah.textContent = formatRupiah(donatur.jumlah);

        head.appendChild(nama);
        head.appendChild(jumlah);
        li.appendChild(head);

        if (donatur.pesan) {
          var pesan = document.createElement("p");
          pesan.className = "referal-donor-pesan";
          pesan.textContent = "“" + donatur.pesan + "”";
          li.appendChild(pesan);
        }

        if (donatur.at) {
          var waktu = document.createElement("p");
          waktu.className = "referal-donor-waktu";
          waktu.textContent = formatTanggal(donatur.at);
          li.appendChild(waktu);
        }

        list.appendChild(li);
      });

      return list;
    };

    var buatCaret = function () {
      var caret = document.createElement("span");
      caret.className = "referal-caret";
      caret.setAttribute("aria-hidden", "true");
      caret.innerHTML =
        '<svg viewBox="0 0 12 8" focusable="false"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return caret;
    };

    var buatBarisReferal = function (item, urutan, daftar) {
      var total = formatAngka(item.total);
      var donatur = daftar || [];
      var row = document.createElement("li");
      row.className = "referal-row" + (total ? "" : " referal-row--nihil");

      var berperingkat = total && urutan <= 3;
      if (berperingkat) {
        row.className += " referal-row--juara referal-row--" + PERINGKAT[urutan - 1].kelas;
      }

      var detailId = "referal-detail-" + urutan;
      var head = document.createElement(donatur.length ? "button" : "div");
      head.className = "referal-row-btn" + (donatur.length ? "" : " referal-row-btn--statis");

      if (donatur.length) {
        head.type = "button";
        head.setAttribute("aria-expanded", "false");
        head.setAttribute("aria-controls", detailId);
      }

      var rank = document.createElement("span");
      rank.className = "referal-rank";
      rank.textContent = total ? String(urutan) : "–";

      var info = document.createElement("span");
      info.className = "referal-info";

      var namaWrap = document.createElement("span");
      namaWrap.className = "referal-nama";

      if (berperingkat) namaWrap.appendChild(buatMahkota(urutan, "Referal terbesar"));

      var nama = document.createElement("span");
      nama.textContent = item.nama;
      namaWrap.appendChild(nama);

      var meta = document.createElement("span");
      meta.className = "referal-meta";
      meta.textContent = item.divisi + " · " + (item.jumlahDonatur || 0) + " donatur";

      info.appendChild(namaWrap);
      info.appendChild(meta);

      var jumlah = document.createElement("b");
      jumlah.className = "referal-total";
      jumlah.textContent = formatRupiah(total);

      head.appendChild(rank);
      head.appendChild(info);
      head.appendChild(jumlah);
      if (donatur.length) head.appendChild(buatCaret());
      row.appendChild(head);

      if (donatur.length) {
        var detail = document.createElement("div");
        detail.className = "referal-detail";
        detail.id = detailId;
        detail.hidden = true;
        detail.appendChild(buatDetailDonatur(donatur));
        row.appendChild(detail);

        head.addEventListener("click", function () {
          var buka = head.getAttribute("aria-expanded") === "true";
          head.setAttribute("aria-expanded", buka ? "false" : "true");
          detail.hidden = buka;
        });
      }

      return row;
    };

    var ambilPapan = function () {
      return fetch("/api/referal", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      });
    };

    var ambilDonaturReferal = function () {
      return fetch("/api/referal/donatur", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      });
    };

    if (referalTanpaBtn && referalTanpaDetail) {
      referalTanpaBtn.addEventListener("click", function () {
        var buka = referalTanpaBtn.getAttribute("aria-expanded") === "true";
        referalTanpaBtn.setAttribute("aria-expanded", buka ? "false" : "true");
        referalTanpaDetail.hidden = buka;
      });
    }

    Promise.all([ambilDonasi(), ambilPapan(), ambilDonaturReferal()])
      .then(function (hasil) {
        var data = hasil[0];
        var papan = hasil[1];
        var daftarDonatur = hasil[2].items || [];

        var perReferal = {};
        var tanpaList = [];

        daftarDonatur.forEach(function (donatur) {
          var kunci = donatur.referal || "";
          if (!kunci) {
            tanpaList.push(donatur);
            return;
          }
          if (!perReferal[kunci]) perReferal[kunci] = [];
          perReferal[kunci].push(donatur);
        });

        referalList.textContent = "";
        (papan.items || []).forEach(function (item, index) {
          referalList.appendChild(buatBarisReferal(item, index + 1, perReferal[item.nama] || []));
        });

        if (referalEmpty) referalEmpty.hidden = (papan.items || []).length > 0;

        if (referalTanpaWrap) {
          var tanpa = papan.tanpaReferal || { total: "0", jumlahDonatur: 0 };
          var totalTanpa = formatAngka(tanpa.total);
          referalTanpaWrap.hidden = totalTanpa <= 0;
          if (referalTanpaTotal) referalTanpaTotal.textContent = formatRupiah(totalTanpa);
          if (referalTanpaMeta) referalTanpaMeta.textContent = (tanpa.jumlahDonatur || 0) + " donatur";

          if (referalTanpaDetail && tanpaList.length) {
            referalTanpaDetail.textContent = "";
            referalTanpaDetail.appendChild(buatDetailDonatur(tanpaList));
            referalTanpaDetail.hidden = referalTanpaBtn
              ? referalTanpaBtn.getAttribute("aria-expanded") !== "true"
              : true;
          }
        }

        if (jumlahEl) jumlahEl.textContent = data.count || 0;
        if (totalEl) totalEl.textContent = formatRupiah(data.terkumpul);
        if (targetElPage) targetElPage.textContent = formatRupiah(data.target);
        if (persenElPage) persenElPage.textContent = data.persen + "% dari target";
        if (barElPage) barElPage.style.width = data.persen + "%";
      })
      .catch(function () {
        if (referalEmpty) {
          referalEmpty.textContent = "Gagal memuat papan referal. Coba muat ulang halaman.";
          referalEmpty.hidden = false;
        }
      });
  }

  /* ---------------- Dapur LP201: target donasi ---------------- */

  var formPengaturan = document.getElementById("form-pengaturan");

  if (formPengaturan) {
    var targetInput = document.getElementById("target-donasi");
    var awalInput = document.getElementById("donasi-awal");
    var submitPengaturan = document.getElementById("pengaturan-submit");
    var notePengaturan = document.getElementById("pengaturan-note");

    /* Hanya mengisi isian target dari database; tidak pernah menyimpan
       apa pun saat donatur ditambah atau diedit. */
    var renderTarget = function (data) {
      if (document.activeElement !== targetInput) targetInput.value = data.target || "";
      if (document.activeElement !== awalInput) awalInput.value = data.donasiAwal || "";
    };

    var muatTarget = function () {
      return ambilDonasi()
        .then(renderTarget)
        .catch(function () {});
    };

    formPengaturan.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!Number(targetInput.value)) {
        setNote(notePengaturan, "Isi target donasi dulu ya.", "error");
        targetInput.focus();
        return;
      }

      submitPengaturan.disabled = true;
      setNote(notePengaturan, "Menyimpan…", "");

      fetch("/api/pengaturan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: targetInput.value, donasiAwal: awalInput.value })
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { status: response.status, ok: response.ok, payload: body };
          });
        })
        .then(function (result) {
          if (result.status === 401) {
            sesiHabis(notePengaturan);
            return;
          }
          if (!result.ok || !result.payload.ok) {
            throw new Error(result.payload.error || "Gagal menyimpan target.");
          }
          setNote(notePengaturan, "Target donasi tersimpan.", "success");
          return muatTarget();
        })
        .catch(function (error) {
          setNote(notePengaturan, error.message || "Gagal menyimpan target.", "error");
        })
        .then(function () {
          submitPengaturan.disabled = false;
        });
    });

    muatTarget();
  }

  /* ---------------- Dapur LP201: data donatur ---------------- */

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

    var refreshDapur = document.getElementById("dapur-refresh");
    var ringkasDapur = document.getElementById("dapur-ringkas");

    var editingId = null;

    var resetFormDonatur = function () {
      editingId = null;
      formDonatur.reset();
      titleDonatur.textContent = "Tambah donatur";
      submitDonatur.textContent = "Simpan donatur";
      cancelDonatur.hidden = true;
    };

    var isiFormDonatur = function (item) {
      editingId = item.id;
      namaInput.value = item.nama;
      jumlahInput.value = item.jumlah;
      pesanInput.value = item.pesan;
      titleDonatur.textContent = "Edit donatur";
      submitDonatur.textContent = "Simpan perubahan";
      cancelDonatur.hidden = false;
      setNote(noteDonatur, "Sedang mengedit: " + item.nama, "");
      namaInput.focus();
    };

    var buatBaris = function (item, urutan) {
      var row = document.createElement("article");
      row.className = "dapur-item";

      var peringkat = peringkatDari(item, urutan);
      if (peringkat) {
        row.className += " dapur-item--juara dapur-item--" + PERINGKAT[peringkat - 1].kelas;
        row.appendChild(buatMahkota(peringkat));
      }

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
              return { status: response.status, ok: response.ok, payload: payload };
            });
          })
          .then(function (result) {
            if (result.status === 401) {
              sesiHabis(noteDonatur);
              return;
            }
            if (!result.ok || !result.payload.ok) throw new Error(result.payload.error || "Gagal menghapus.");
            if (editingId === item.id) resetFormDonatur();
            setNote(noteDonatur, "Donatur dihapus.", "success");
            return muatDonatur();
          })
          .catch(function (error) {
            setNote(noteDonatur, error.message || "Gagal menghapus donatur.", "error");
          });
      });

      actions.appendChild(editBtn);
      actions.appendChild(hapusBtn);
      row.appendChild(actions);

      return row;
    };

    var renderDonatur = function (data) {
      listDapur.textContent = "";
      (data.items || []).forEach(function (item, index) {
        listDapur.appendChild(buatBaris(item, index + 1));
      });
      if (emptyDapur) emptyDapur.hidden = (data.items || []).length > 0;
      if (ringkasDapur) {
        ringkasDapur.textContent =
          (data.count || 0) +
          " donatur tercatat · total " +
          formatRupiah(data.totalDonatur) +
          ". Terkumpul " +
          formatRupiah(data.terkumpul) +
          " dari target " +
          formatRupiah(data.target) +
          " (" +
          data.persen +
          "%). Target tetap " +
          formatRupiah(data.target) +
          " sampai diubah di form target.";
      }
    };

    var muatDonatur = function () {
      return ambilDonasi()
        .then(renderDonatur)
        .catch(function () {
          if (emptyDapur) {
            emptyDapur.textContent = "Gagal memuat data dari database.";
            emptyDapur.hidden = false;
          }
        });
    };

    formDonatur.addEventListener("submit", function (event) {
      event.preventDefault();

      var nama = namaInput.value.trim();
      if (!nama) {
        setNote(noteDonatur, "Nama donatur wajib diisi.", "error");
        namaInput.focus();
        return;
      }

      var target = editingId ? "/api/donatur/" + editingId : "/api/donatur";
      var method = editingId ? "PUT" : "POST";

      submitDonatur.disabled = true;
      setNote(noteDonatur, "Menyimpan…", "");

      fetch(target, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: nama,
          jumlah: jumlahInput.value,
          pesan: pesanInput.value.trim()
        })
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { status: response.status, ok: response.ok, payload: body };
          });
        })
        .then(function (result) {
          if (result.status === 401) {
            sesiHabis(noteDonatur);
            return;
          }
          if (!result.ok || !result.payload.ok) {
            throw new Error(result.payload.error || "Gagal menyimpan donatur.");
          }
          setNote(
            noteDonatur,
            editingId ? "Perubahan donatur tersimpan." : "Donatur baru tersimpan.",
            "success"
          );
          resetFormDonatur();
          return muatDonatur();
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

    refreshDapur.addEventListener("click", muatDonatur);
    muatDonatur();
  }

  /* ---------------- Halaman /update-referal (tidak ada di menu) ---------------- */

  var updateList = document.getElementById("update-list");

  if (updateList) {
    var updateRingkas = document.getElementById("update-ringkas");
    var updateEmpty = document.getElementById("update-empty");
    var updateNote = document.getElementById("update-note");
    var updateJumlah = document.getElementById("update-jumlah");
    var updateBerreferal = document.getElementById("update-berreferal");
    var updateTanpa = document.getElementById("update-tanpa");
    var updateRefresh = document.getElementById("update-refresh");
    var divisiReferal = [];

    var ambilPapanReferal = function () {
      return fetch("/api/referal", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      });
    };

    var ambilDonaturReferal = function () {
      return fetch("/api/referal/donatur", { cache: "no-store" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      });
    };

    var buatRingkasRow = function (nama, meta, total) {
      var row = document.createElement("li");
      row.className = "referal-row";

      var info = document.createElement("div");
      info.className = "referal-info";

      var namaEl = document.createElement("span");
      namaEl.className = "referal-nama";
      namaEl.textContent = nama;

      var metaEl = document.createElement("span");
      metaEl.className = "referal-meta";
      metaEl.textContent = meta;

      info.appendChild(namaEl);
      info.appendChild(metaEl);

      var jumlahEl = document.createElement("b");
      jumlahEl.className = "referal-total";
      jumlahEl.textContent = formatRupiah(total);

      row.appendChild(info);
      row.appendChild(jumlahEl);
      return row;
    };

    var renderRingkas = function (papan) {
      var totalBerreferal = 0;
      var orangBerreferal = 0;

      if (updateRingkas) updateRingkas.textContent = "";

      (papan.items || []).forEach(function (item) {
        var total = Number(String(item.total || "0").replace(/\D/g, ""));
        var banyak = Number(item.jumlahDonatur || 0);
        if (!total) return;
        totalBerreferal += total;
        orangBerreferal += banyak;
        if (updateRingkas) {
          updateRingkas.appendChild(
            buatRingkasRow(item.nama, item.divisi + " · " + banyak + " donatur", total)
          );
        }
      });

      var tanpa = papan.tanpaReferal || { total: "0", jumlahDonatur: 0 };
      var totalTanpa = Number(String(tanpa.total || "0").replace(/\D/g, ""));
      var orangTanpa = Number(tanpa.jumlahDonatur || 0);

      if (totalTanpa > 0 && updateRingkas) {
        updateRingkas.appendChild(buatRingkasRow("Tanpa referal", orangTanpa + " donatur", totalTanpa));
      }

      if (updateJumlah) updateJumlah.textContent = String(orangBerreferal + orangTanpa);
      if (updateBerreferal) updateBerreferal.textContent = String(orangBerreferal);
      if (updateTanpa) updateTanpa.textContent = String(orangTanpa);
    };

    var buatPilihan = function (terpilih) {
      var select = document.createElement("select");
      select.className = "referal-select";

      var kosong = document.createElement("option");
      kosong.value = "";
      kosong.textContent = "— Tanpa referal —";
      select.appendChild(kosong);

      divisiReferal.forEach(function (divisi) {
        var group = document.createElement("optgroup");
        group.label = divisi.nama;
        (divisi.anggota || []).forEach(function (nama) {
          var option = document.createElement("option");
          option.value = nama;
          option.textContent = nama;
          group.appendChild(option);
        });
        select.appendChild(group);
      });

      select.value = terpilih || "";
      if (select.value !== (terpilih || "")) select.value = "";
      return select;
    };

    var buatBarisUpdate = function (item) {
      var row = document.createElement("article");
      row.className = "dapur-item referal-update-item";

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

      if (item.at) {
        var waktu = document.createElement("p");
        waktu.className = "donatur-waktu";
        waktu.textContent = formatTanggal(item.at);
        row.appendChild(waktu);
      }

      var field = document.createElement("label");
      field.className = "referal-select-field";

      var labelText = document.createElement("span");
      labelText.textContent = "Referal";

      var select = buatPilihan(item.referal);
      select.setAttribute("aria-label", "Referal untuk " + item.nama);

      select.addEventListener("change", function () {
        var nilai = select.value;
        select.disabled = true;
        setNote(updateNote, "Menyimpan referal " + item.nama + "…", "");

        fetch("/api/referal/donatur/" + item.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referal: nilai })
        })
          .then(function (response) {
            return response.json().then(function (payload) {
              return { status: response.status, ok: response.ok, payload: payload };
            });
          })
          .then(function (result) {
            if (result.status === 401) {
              sesiHabis(updateNote);
              return;
            }
            if (!result.ok || !result.payload.ok) {
              throw new Error(result.payload.error || "Gagal menyimpan referal.");
            }
            setNote(
              updateNote,
              nilai
                ? "Tersimpan: " + item.nama + " → " + nilai + "."
                : "Tersimpan: " + item.nama + " tanpa referal.",
              "success"
            );
            return ambilPapanReferal().then(renderRingkas);
          })
          .catch(function (error) {
            setNote(updateNote, error.message || "Gagal menyimpan referal.", "error");
            select.value = item.referal || "";
          })
          .then(function () {
            select.disabled = false;
          });
      });

      field.appendChild(labelText);
      field.appendChild(select);
      row.appendChild(field);

      return row;
    };

    var muatReferal = function () {
      setNote(updateNote, "Memuat data…", "");

      return Promise.all([ambilDonaturReferal(), ambilPapanReferal()])
        .then(function (hasil) {
          var daftar = hasil[0];
          var papan = hasil[1];

          divisiReferal = papan.divisi || [];

          updateList.textContent = "";
          (daftar.items || []).forEach(function (item) {
            updateList.appendChild(buatBarisUpdate(item));
          });
          if (updateEmpty) updateEmpty.hidden = (daftar.items || []).length > 0;

          renderRingkas(papan);
          setNote(updateNote, (daftar.count || 0) + " donatur dimuat. Pilih referal pada tiap donatur untuk menyimpan.", "");
        })
        .catch(function (error) {
          if (updateEmpty) {
            updateEmpty.textContent = "Gagal memuat data. Coba muat ulang halaman.";
            updateEmpty.hidden = false;
          }
          setNote(updateNote, error.message || "Gagal memuat data.", "error");
        });
    };

    if (updateRefresh) updateRefresh.addEventListener("click", muatReferal);
    muatReferal();
  }
})();
