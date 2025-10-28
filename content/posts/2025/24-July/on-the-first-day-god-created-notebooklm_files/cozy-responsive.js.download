(($) => {
  document.addEventListener("DOMContentLoaded", function () {
    const cozyResponsive = document.querySelectorAll(
      ".cozy-responsive-show__initialized"
    );

    cozyResponsive.forEach((element) => {
      const desktopShow = element.getAttribute("data-desktop-show")
        ? true
        : false;
      const tabletShow = element.getAttribute("data-tablet-show")
        ? true
        : false;
      const tabletViewport = element.getAttribute("data-tablet-viewport-width");
      const mobileShow = element.getAttribute("data-mobile-show")
        ? true
        : false;
      const mobileViewport = element.getAttribute("data-mobile-viewport-width");

      function toggleElementVisibility() {
        if (window.innerWidth <= parseInt(tabletViewport)) {
          element.style.display = tabletShow ? "" : "none";
        }
        if (window.innerWidth <= parseInt(mobileViewport)) {
          element.style.display = mobileShow ? "" : "none";
        }

        if (window.innerWidth > 1023) {
          element.style.display = desktopShow ? "" : "none";
        }
      }

      toggleElementVisibility();

      window.addEventListener("resize", toggleElementVisibility);
    });
  });
})(jQuery);
