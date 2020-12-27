# Generated by Django 3.1.3 on 2020-11-24 22:36

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('gsportal', '0006_auto_20201123_0554'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='user',
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.CASCADE, related_name='accounts', to='gsportal.myuser'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='alert',
            name='user',
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.CASCADE, related_name='alerts', to='gsportal.myuser'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='alertq',
            name='user',
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.CASCADE, related_name='alerts_in_Q', to='gsportal.myuser'),
            preserve_default=False,
        ),
    ]
