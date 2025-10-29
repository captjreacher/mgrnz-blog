(function(window, $) {

    var customFile = {
        preventFile: _preventFile,
        copyToClipboard: _copyToClipboard,
        regeneratePrivateLink: _regeneratePrivateLink,
        pda_prevent_all: _pda_prevent_all
    };

    function _preventFile(fileId) {
        var checkBoxId = "#ckb_" + fileId;
        var isPrevented = $(checkBoxId).is(':checked') ? 1 : 0;
        $.ajax({
            url: ajax_object.ajaxurl, // this is the object instantiated in wp_localize_script function
            type: 'POST',
            data: {
                action: 'myaction',
                id: fileId, // this is the function in your functions.php that will be triggered
                is_prevented: isPrevented,
                security_check: $(checkBoxId).attr('nonce')
            },
            success: function(data) {
                //Do something with the result from server
                if (typeof data.error !== 'undefined') {
                    $(checkBoxId).prop('checked', false);
                    alert(data.error);
                } else if (data == 'invalid_nonce') {
                    alert('No! No! No! Verify Nonce Fails!');
                    if ($(checkBoxId).is(':checked')) {
                        $(checkBoxId).prop('checked', false);
                    } else {
                        $(checkBoxId).prop('checked', true);
                    }
                } else {
                    var labelId = "#custom_url_" + data.post_id;
                    var btnCopyId = '#btn_copy_' + data.post_id;
                    var divCustomUrlId = '#custom_url_div_' + data.post_id;
                    var custom_url_class = '.custom_url_' + data.post_id;
                    if (data.is_prevented === "1") {
                        $(custom_url_class).fadeIn();
                        $(labelId).val(data.url);
                    } else {
                        $(custom_url_class).fadeOut();
                    }
                }
            },
            error: function(error) {
                console.log("Errors", error);
                alert(error.responseText);
            }
        });
    }

    function _regeneratePrivateLink(fileId) {
        var buttonId = "#btn_regenerate_" + fileId;
        var privateLinkInput = "#custom_url_" + fileId;

        $.ajax({
            url: ajax_object.ajaxurl, // this is the object instantiated in wp_localize_script function
            type: 'POST',
            data: {
                action: 'regenerate-url',
                id: fileId, // this is the function in your functions.php that will be triggered
                security_check: $(buttonId).attr('nonce')
            },
            success: function(data){
                $(privateLinkInput).focus();
                $(privateLinkInput).val(data.url);
            },
            error: function(error){
                console.log("Errors", error);
                alert(error.responseText);
            }
        });
    }
    window.customFile = customFile;

    function _copyToClipboard(btn, txt_input) {
        var $temp = $("<input>");
        $("body").append($temp);
        $temp.val($(txt_input).val()).select();
        document.execCommand("copy");
        $temp.remove();
        $(btn).text("URL Copied");
        setTimeout(function() {
            $(btn).text("Copy URL");
        }, 5000);
    }

    function check_all_file_protected() {
        var all_protected = true;
        $('.pda_cbk').each(function() {
            if($(this).attr('checked') !== "checked") {
                all_protected = false;
                return;
            }
        });
        return all_protected;
    }

    function _pda_prevent_all(obj) {
        var status = check_all_file_protected();
        $('.pda_cbk').each(function() {
            var checked = $(this).attr('checked');
            if(status === false && checked !== "checked") {
                $(this).trigger("click");
            } else if(status === true && checked === "checked") {
                $(this).trigger("click");
            }
        });
    }

    $(document).ready(function () {
        $("body").on("click", "#pda_signup_newsletter_btn", function() {
            var email = $("#pda_signup_newsletter").val().trim();
            var emailPattern = /^\w+@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/;

            if(email && emailPattern.test(email)) {
                $(".pda_sub_div").hide("fast");
                $("#pda_signup_newsletter").hide("slow");
                $("#pda_signup_newsletter_btn").hide("slow");
                var email = JSON.stringify({
                    email: email
                });
                $.ajax({
                    url: 'https://yvpc5pln0i.execute-api.ap-southeast-1.amazonaws.com/prod/getresponseCreateContact',
                    type: 'POST',
                    headers: { "x-api-key": "4eycbq9Cxf6L1JiW2iSoI1tWu2KGSvtH9jswJXYA", 'Content-Type' : 'application/json' },
                    dataType: 'json',
                    data: email,
                    success: function (data) {
                        console.log("Success", data);
                    },
                    error: function (error) {
                        console.log("Error", error);
                    }
                });

                $.ajax({
                    url: ajax_object.ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'pda_subscribe',
                        security_check: ajax_object.pda_sub_nonce
                    }
                });
            } else {
                $("#pda_signup_newsletter_error").show("slow");
                $("#pda_signup_newsletter").focus();
            }
         });
    });


})(window, jQuery);


