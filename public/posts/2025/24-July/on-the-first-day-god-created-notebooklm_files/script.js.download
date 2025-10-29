var pda_media = (function ($) {
  $(document).ready(function () {
	addBorderClass();
  });

  function addBorderClass() {
	if (undefined !== wp.media) {
	  wp.media.view.Attachment.Library = wp.media.view.Attachment.Library.extend({
		className: function () {
		  return 'attachment ' + this.model.get('customClass');
		}
	  });
	}
  }

  function handleAfterUpdatedMeta(exists) {
	_.extend(wp.media.view.Attachment.prototype, {
	  updateSave: function (status) {
		var save = this._save = this._save || {status: 'ready'};
		if (status && status !== save.status) {
		  this.$el.removeClass('save-' + save.status);
		  save.status = status;
		}

		this.$el.addClass('save-' + save.status);

		if (!this.model.changed.status && this.model.changed.compat) {
		  var changed = this.model.changed;
		  if (changed && changed.url) {
			var post_id = this.model.id;
			var $inputUrl = $('.setting[data-setting=url] input[readonly]');
			if ($inputUrl.val() === changed.url) {
			  return this;
			}
			$inputUrl.val(changed.url);
			var $checkBoxProtection = $('#pda_' + post_id + '_protection');
			var checked = $checkBoxProtection.prop('checked');
			if (checked) {
			  handleProtectedElement(post_id, exists);
			} else if (checked === false) {
			  handleUnprotectedElement(post_id, exists);
			}
			if (window.pdaLiteProtectProcessing) {
			  if (checked) {
				toastr.success("Great! You've successfully protected this file.", '', {
				  timeOut: 2000
				});
				window.pdaLiteProtectProcessing = false;
			  } else if (checked === false) {
				toastr.success("Great! You've successfully unprotected this file.", '', {
				  timeOut: 2000
				});
				window.pdaLiteProtectProcessing = false;
			  }
			}
		  }
		}

		return this;
	  }
	});
  }

  function handleProtectedElement(postID, $checkBoxProtection, $fapWrap) {
	$('[data-id=' + postID + ']').addClass('pda-protected-grid-view');
	$('.selection-view').addClass('pda-protected-selection-view');
  }

  function handleUnprotectedElement(postID, $checkBoxProtection, $fapWrap) {
	$('[data-id=' + postID + ']').removeClass('pda-protected-grid-view');
	$('.selection-view').removeClass('pda-protected-selection-view');
  }

  function handleFileExistError(url) {
	toastr.error(`The File: ${url} does not exist.`, '', {
	  timeOut: 2000,
	});
  }

  return {
	handleProtectedElement,
	handleUnprotectedElement,
	handleAfterUpdatedMeta,
	handleFileExistError
  }
})(jQuery);
