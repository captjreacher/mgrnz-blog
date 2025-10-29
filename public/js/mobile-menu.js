// Mobile menu toggle functionality
document.addEventListener('DOMContentLoaded', function() {
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const sidebar = document.querySelector('aside.fixed');
  
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
      if (window.innerWidth <= 1024) {
        if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
});